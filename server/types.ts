export interface Org {
	id: string;
	name: string;
}

export interface BudgetMember {
	user_id: string;
	email: string;
	limit_micro_cents: string | null;
	spent_micro_cents: string | null;
	exceeded: boolean;
	resets_at: string | null;
	source: "custom" | "default" | null;
	updated_at: string | null;
}

export interface Identity {
	email: string | null;
	sub: string | null;
}

export interface Credential {
	access: string;
	refresh: string;
	expires: number;
	identity: Identity;
	storedAt: number;
}

export interface DeviceStart {
	device_code: string;
	user_code: string;
	verification_uri_complete: string;
	expires_in: number;
	interval: number;
}

export interface DeviceToken {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type?: string;
	scope?: string;
}

export interface DeviceError {
	error: string;
	error_description?: string;
}

export type DeviceResponse =
	| { kind: "token"; data: DeviceToken }
	| { kind: "error"; data: DeviceError };
