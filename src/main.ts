import CookieParser from "cookie-parser";
import Express from "express";
import Qs from "qs";

import Meta from "./meta.js";
import { tables } from "./db_schema.js";
import { db, Util as DBUtil } from "./db.js";
import API from "./api.js";
import HTMX from "./htmx.js";
import Auth from "./auth.js";

export const app = Express();

app.set("views", "www/views");
app.set("view engine", "ejs");
app.set("query parser", (str: string) => Qs.parse(str));
app.use(CookieParser(), Express.json(), Express.urlencoded());

// Auth.
app.use(Auth.middleSession);

// Static content.
app.use("/static", Express.static("www/static"));
app.get("/favicon.ico", (req, res) => res.sendStatus(404));

// Dynamic content.
app.use("/api/v1", API.V1.ROUTER);
app.use("/htmx/v1", HTMX.V1.ROUTER);

// NOTE: These middleware functions are NOT a security measure to stop unauthed access.

function middleInitRedirect(need_init: boolean, route: string): Express.RequestHandler {
	return (req, res, next) => {
		if (DBUtil.isInit(false) === need_init) {
			next();
		} else {
			res.redirect(route);
		}
	};
}

function middleAuthRedirect(need_admin: boolean, need_super_admin: boolean, route: string): Express.RequestHandler {
	return (req, res, next) => {
		const session = res.locals.session as Auth.Session | undefined;

		if (session === undefined) {
			return res.redirect(route);
		}

		const req_admin = need_admin ? session.is_admin : true;
		const req_super_admin = need_super_admin ? session.is_super_admin : true;

		if (req_admin && req_super_admin) {
			next();
		} else {
			res.redirect(route);
		}
	};
}

const ejs_meta = {
	name: Meta.META_DNAME,
	version: Meta.META_VERSION,
};

type Route = {
	meta: typeof ejs_meta;
	view: string;
	session?: Auth.Session;
};

app.get("/init", middleInitRedirect(false, "/dashboard"), (req, res) => {
	res.render("init.ejs", { meta: ejs_meta });
});

app.use(middleInitRedirect(true, "/init"))
	.get("/login", (req, res) => {
		res.render("login.ejs", { meta: ejs_meta });
	})
	.get("/dashboard", (req, res) => {
		res.render("base.ejs", {
			meta: ejs_meta,
			view: "routes/dashboard.ejs",
			session: res.locals.session,
		});
	})
	.get("/manual", (req, res) => {
		res.render("base.ejs", {
			meta: ejs_meta,
			view: "routes/manual.ejs",
			session: res.locals.session,
		});
	});

app.use(middleInitRedirect(true, "/init"), middleAuthRedirect(true, false, "/dashboard"))
	.get("/bots", (req, res) => {
		res.render("base.ejs", {
			meta: ejs_meta,
			view: "routes/bots.ejs",
			session: res.locals.session,
		});
	})
	.get("/settings", (req, res) => {
		res.render("base.ejs", {
			meta: ejs_meta,
			view: "routes/settings.ejs",
			session: res.locals.session,
		});
	});

app.use(middleInitRedirect(true, "/init"), middleAuthRedirect(true, true, "/dashboard")).get("/users", (req, res) => {
	res.render("base.ejs", {
		meta: ejs_meta,
		view: "routes/users.ejs",
		session: res.locals.session,
	});
});

app.get("*path", middleInitRedirect(true, "/init"), (req, res) => {
	res.redirect("/dashboard");
});

app.listen(Meta.META_PORT);
