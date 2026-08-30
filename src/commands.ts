export abstract class Bot {
	public abstract message(broadcaster_id: string, message: string): void;

	public abstract join(broadcaster_id: string, offline_only: boolean): void;

	public abstract part(broadcaster_id: string): void;
}
