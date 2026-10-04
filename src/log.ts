import NodeFS from "node:fs";
import NodePath from "node:path";

import Meta from "./meta.js";

export namespace Logger {
	const ANSI_COLORS = {
		RESET: "\x1b[0m",
		CYAN: "\x1b[36m",
		YELLOW: "\x1b[33m",
		RED: "\x1b[31m",
		GREEN: "\x1b[32m",
		GREY: "\x1b[90m",
		WHITE: "\x1b[37m",
	};

	function getFileTimestamp(): string {
		const now = new Date();

		const year = now.getFullYear();
		const month = (now.getMonth() + 1).toString().padStart(2, "0");
		const day = now.getDate().toString().padStart(2, "0");

		const hour = now.getHours().toString().padStart(2, "0");
		const minute = now.getMinutes().toString().padStart(2, "0");
		const second = now.getSeconds().toString().padStart(2, "0");

		return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
	}

	const filestream = (() => {
		const path = NodePath.join(Meta.META_LOG_PATH, `${getFileTimestamp()}.log.txt`);
		NodeFS.mkdirSync(Meta.META_LOG_PATH, { recursive: true });
		return NodeFS.createWriteStream(path, { flags: "a+", encoding: "utf8" });
	})();

	function log(level: string, level_color: string, message: string) {
		const timestamp = new Date().toISOString();

		const stdout_msg = `${ANSI_COLORS.GREY}[${timestamp}]${ANSI_COLORS.RESET} ${level_color}[${level}]${ANSI_COLORS.RESET} ${message}\n`;
		const file_msg = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

		process.stdout.write(stdout_msg);
		filestream.write(file_msg);
	}

	export function info(message: string) {
		log("INFO", ANSI_COLORS.CYAN, message);
	}

	export function warn(message: string) {
		log("WARN", ANSI_COLORS.YELLOW, message);
	}

	export function error(message: string) {
		log("INFO", ANSI_COLORS.RED, message);
	}
}
