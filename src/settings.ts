import { createRoot, createEffect, on } from "solid-js";
import { createMutable, modifyMutable, reconcile } from "solid-js/store";
import copyText from "app/copy.ts";

// Application settings.
//
// We could potentially store string indices rather than the strings, however
// this complicates the ability to use saved settings when the source data may
// have been regenerated, or if code in the condenser or joiner change (which
// could change the string indices). So, all strings in the settings are the
// strings from the actual data (and notably not derived strings, e.g. the
// grouping labels in MultiselectFilters).
export type Settings = {
    dates: { start: Date, end: Date },
    data_etags: string[] | undefined,
    selection: { [key: string]: MultiselectSettings },
    signature: string | undefined,
    pingCrashId: string | undefined,
    sort: "clients" | "pings",
    meta: {
        // An ISO 8601 duration (ish), omitting the leading "P" and allowing
        // arbitrary case and whitespace.
        expiration: string,
        relativeDates: boolean,
        storeDates: boolean,
        storeEtags: boolean,
        storeSelection: boolean,
        storeSignature: boolean,
        storePing: boolean,
        storeSort: boolean,
        storeMeta: boolean,
    }
};

export type MultiselectSettings = {
    // Omitted if all fields selected.
    selected?: (string | null)[],
    grouped?: boolean,
};

interface SavedSettings {
    version: number,
}

// The saved settings have some derived fields and information.
interface SavedSettingsV1 extends SavedSettings {
    version: 1,
    // `start`/`end` are absolute day numbers, or relative to the current
    // day if `relative`. Days are inclusive.
    dates?: { start: number, end: number, relative?: boolean },
    data_etags?: string[],
    selection?: { [key: string]: MultiselectSettings },
    signature?: string,
    pingCrashId?: string,
    sort?: "clients" | "pings",
    meta?: {
        expiration: string,
        relativeDates: boolean,
        storeDates: boolean,
        storeEtags: boolean,
        storeSelection: boolean,
        storeSignature: boolean,
        storePing: boolean,
        storeSort: boolean,
        storeMeta: boolean,
    },
    expires?: string,
}

const DAY_MILLIS = 1000 * 60 * 60 * 24;

function loadDates(dates?: { start: number, end: number, relative?: boolean })
    : { start: Date, end: Date } {
    dates = dates ?? { start: -7, end: -1, relative: true };
    if (dates.relative) {
        const now = Date.now();
        const now_day = Math.floor(now / DAY_MILLIS);
        dates.start += now_day;
        dates.end += now_day;
    }
    return {
        start: new Date(dates.start * DAY_MILLIS),
        end: new Date(dates.end * DAY_MILLIS)
    };
}

const LATEST_SAVED_SETTINGS_VERSION: 1 = 1;
export type LatestSavedSettings = SavedSettingsV1;

function loadSettings(settings?: SavedSettings): Settings {
    const unexpectedVersion = settings &&
        (!settings.version || settings.version < 1 || settings.version > LATEST_SAVED_SETTINGS_VERSION);
    if (!settings || unexpectedVersion) {
        if (unexpectedVersion) {
            console.error(`unexpected settings version: ${settings!.version}`);
        }
        settings = { version: LATEST_SAVED_SETTINGS_VERSION } satisfies LatestSavedSettings;
    }
    if (settings.version === 1) {
        const s = settings as SavedSettingsV1;
        return {
            dates: loadDates(s.dates),
            data_etags: s.data_etags,
            selection: s.selection ?? {},
            signature: s.signature,
            pingCrashId: s.pingCrashId,
            sort: s.sort ?? "clients",
            meta: s.meta ?? {
                expiration: "1y",
                relativeDates: false,
                storeDates: true,
                storeEtags: true,
                storeSelection: true,
                storeSignature: true,
                storePing: true,
                storeSort: true,
                storeMeta: true,
            },
        };
    }
    throw new Error("unreachable");
}

function parseDuration(duration: string): { months: number, days: number } {
    // Remove whitespace and convert to uppercase
    duration = duration.replace(/\s/g, "").toUpperCase();
    const years = duration.match(/(\d+)Y/);
    const months = duration.match(/(\d+)M/);
    const weeks = duration.match(/(\d+)W/);
    const days = duration.match(/(\d+)D/);
    return {
        months: (years ? parseInt(years[1]) * 12 : 0) + (months ? parseInt(months[1]) : 0),
        days: (weeks ? parseInt(weeks[1]) * 7 : 0) + (days ? parseInt(days[1]) : 0),
    };
}

function saveSettings(settings: Settings): LatestSavedSettings {
    const s: LatestSavedSettings = { version: LATEST_SAVED_SETTINGS_VERSION };

    if (settings.meta.storeDates) {
        let start = Math.floor(settings.dates.start.getTime() / DAY_MILLIS);
        let end = Math.floor(settings.dates.end.getTime() / DAY_MILLIS);
        s.dates = { start, end };
        if (settings.meta.relativeDates) {
            const now_day = Math.floor(Date.now() / DAY_MILLIS);
            s.dates.start -= now_day;
            s.dates.end -= now_day;
            s.dates.relative = true;
        }
    }
    if (settings.meta.storeEtags) {
        s.data_etags = settings.data_etags;
    }
    if (settings.meta.storeMeta) {
        s.meta = settings.meta;
    }
    if (settings.meta.storeSelection) {
        s.selection = settings.selection;
    }
    if (settings.meta.storeSignature) {
        s.signature = settings.signature;
        if (settings.meta.storePing) {
            s.pingCrashId = settings.pingCrashId;
        }
    }
    if (settings.meta.storeSort) {
        s.sort = settings.sort;
    }
    if (settings.meta.expiration) {
        const { months, days } = parseDuration(settings.meta.expiration);
        const expires = new Date();
        expires.setUTCMonth(expires.getUTCMonth() + months);
        expires.setUTCDate(expires.getUTCDate() + days);
        s.expires = expires.toISOString();
    }

    return s;
}

export async function load(): Promise<Settings> {
    const id = window.location.hash.substr(1);
    if (id) {
        const response = await fetch(`/link/${id}`);
        if (response.ok) {
            return loadSettings(await response.json());
        } else {
            alert(`Failed to load link: ${response.status} ${response.statusText}: ${await response.text()}`);
            window.location.hash = "";
        }
    }
    return loadSettings();
}

let loading: boolean = true;
const settings = createRoot(() => {
    const settings = createMutable<Settings>(loadSettings())
    // Whenever the settings are changed and we're not loading, clear the window hash.
    createEffect(on(() => Object.entries(settings), () => {
        if (!loading && window.location.hash) {
            window.location.hash = "";
        }
    }));
    return settings;
});


export async function loadAndPopulateSettings(f: () => void): Promise<void> {
    modifyMutable(settings, reconcile(await load()));
    f();
    loading = false;
}

function sanitizeLabel(l: string): string {
    return l.replaceAll(/\s/g, "-").replaceAll(/[^-0-9a-zA-Z]/g, "");
}

export async function save(label?: string) {
    const saved = saveSettings(settings);
    let path = "/link";
    if (label) {
        path += `/${sanitizeLabel(label)}`;
    }
    const response = await fetch(path, { method: "POST", body: JSON.stringify(saved) });
    if (response.ok) {
        const { id } = await response.json() as { id: string };
        window.location.hash = id;
        copyText(window.location.toString());
    }
    else {
        alert(`Failed to create link: ${response.status} ${response.statusText}: ${await response.text()}`);
    }
}

export default settings;
