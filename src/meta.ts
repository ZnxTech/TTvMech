export namespace Meta {
	export const META_DNAME = process.env.META_DNAME ?? "TTvMech";
	export const META_UNAME = META_DNAME.toLowerCase();

	export const META_VERSION_MAJOR = 2;
	export const META_VERSION_MINOR = 0;
	export const META_VERSION_PATCH = 0;
	export const META_VERSION_TAG = "beta-1";
	export const META_VERSION = `${META_VERSION_MAJOR}.${META_VERSION_MINOR}.${META_VERSION_PATCH}-${META_VERSION_TAG}`;

	export const META_PORT = process.env.META_PORT ?? 31314;
	export const META_PLUGINS_PATH = process.env.META_PLUGINS_PATH ?? "plugins";
	export const META_DB_PATH = process.env.META_DB_PATH ?? "data/db.sqlite";
	export const META_DB_BACKUP_PATH = process.env.META_DB_BACKUP_PATH ?? null;
	export const META_LOG_PATH = process.env.META_LOG_PATH ?? "data/logs";
}

export default Meta;
