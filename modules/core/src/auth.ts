import NodeCrypto from "node:crypto";

import { eq, inArray, lte } from "drizzle-orm";
import Express from "express";

import { db } from "./db.js";
import { tables } from "./db_schema.js";

export namespace Auth {
	function createSessionId(): string {
		return NodeCrypto.randomBytes(64).toString("base64url");
	}

	function createCSRFId(): string {
		return NodeCrypto.randomBytes(32).toString("base64url");
	}

	function createSalt(): string {
		return NodeCrypto.randomBytes(32).toString("hex");
	}

	function createHash(token: string, salt: string): Buffer {
		return NodeCrypto.argon2Sync("argon2id", {
			message: token,
			nonce: salt,
			memory: 16384,
			passes: 4,
			parallelism: 1,
			tagLength: 64,
		});
	}

	export function createUser(user_name: string, user_pass: string, is_admin: boolean, is_super_admin: boolean) {
		const user_uuid = NodeCrypto.randomUUIDv7();
		const user_salt = createSalt();
		const user_pass_hash = createHash(user_pass, user_salt).toString("hex");

		const _ = db
			.insert(tables.users)
			.values({
				uuid: user_uuid,
				name: user_name,
				pass_hash: user_pass_hash,
				salt: user_salt,
				is_admin: is_admin,
				is_super_admin: is_super_admin,
			})
			.run();
	}

	export function createSession(user_uuid: string): [session_id: string, expires_in: number] {
		const expires_in = 1000 * 60 * 60 * 24 * 7 * 3; // 3 weeks in ms.
		const session_id = createSessionId();
		const expires_at = new Date(Date.now() + expires_in);

		const _ = db
			.insert(tables.user_sessions)
			.values({
				id: session_id,
				user_uuid: user_uuid,
				expire_unix_ms: expires_at,
			})
			.run();

		return [session_id, expires_in];
	}

	export function createUserSession(user_name: string, user_pass: string): [session_id: string, expires_in: number] {
		const user = db
			.select({
				uuid: tables.users.uuid,
				salt: tables.users.salt,
				pass_hash: tables.users.pass_hash,
			})
			.from(tables.users)
			.where(eq(tables.users.name, user_name))
			.get();

		if (!user) {
			throw new Error("Invalid username.");
		}

		const input_pass_hash_buffer = createHash(user_pass, user.salt);
		const user_pass_hash_buffer = Buffer.from(user.pass_hash, "hex");

		if (NodeCrypto.timingSafeEqual(input_pass_hash_buffer, user_pass_hash_buffer)) {
			return createSession(user.uuid);
		} else {
			throw new Error("Invalid password.");
		}
	}

	export function cleanExpiredSessions() {
		const _ = db.delete(tables.user_sessions).where(lte(tables.user_sessions.expire_unix_ms, new Date())).run();
	}

	export function createCSRF(session_id: string): string {
		const expires_in = 1000 * 60 * 30; // 30 minutes in ms.
		const csrf_id = createCSRFId();
		const expires_at = new Date(Date.now() + expires_in);

		const _ = db
			.insert(tables.user_csrfs)
			.values({
				id: csrf_id,
				session_id: session_id,
				expire_unix_ms: expires_at,
			})
			.run();

		return csrf_id;
	}

	export function cleanExpiredCSRFs() {
		const _ = db.delete(tables.user_csrfs).where(lte(tables.user_csrfs.expire_unix_ms, new Date())).run();
	}

	export function validateCSRF(session_id: string, csrf_id: string): boolean {
		cleanExpiredCSRFs();

		const csrf = db.select().from(tables.user_csrfs).where(eq(tables.user_csrfs.id, csrf_id)).get();

		if (!csrf) {
			return false;
		} else {
			return csrf.session_id === session_id;
		}
	}

	export interface Session {
		id: string;
		user_uuid: string;
		user_name: string;
		is_admin: boolean;
		is_super_admin: boolean;
	}

	export function middleSession(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
		const session_id = req.cookies.session_id as string | undefined;
		if (!session_id) {
			return next();
		}

		Auth.cleanExpiredSessions();

		const session_subquery = db
			.select({
				uuid: tables.user_sessions.user_uuid,
			})
			.from(tables.user_sessions)
			.where(eq(tables.user_sessions.id, session_id));

		const user = db
			.select({
				uuid: tables.users.uuid,
				name: tables.users.name,
				is_admin: tables.users.is_admin,
				is_super_admin: tables.users.is_super_admin,
			})
			.from(tables.users)
			.where(inArray(tables.users.uuid, session_subquery))
			.get();

		if (!user) {
			return next();
		}

		res.locals.session = {
			id: session_id,
			user_uuid: user.uuid,
			user_name: user.name,
			is_admin: user.is_admin,
			is_super_admin: user.is_super_admin,
		} as Session;

		next();
	}

	export function middleSessionAuth(need_admin: boolean, need_super_admin: boolean): Express.RequestHandler {
		return (req, res, next) => {
			const session = res.locals.session as Session | undefined;

			if (!session) {
				return res.sendStatus(403);
			}

			const req_admin = need_admin ? session.is_admin : true;
			const req_super_admin = need_super_admin ? session.is_super_admin : true;

			if (req_admin && req_super_admin) {
				next();
			} else {
				res.sendStatus(403);
			}
		};
	}
}

export default Auth;
