import { createSignal, Suspense, Show } from "solid-js";
import html from "solid-js/html";
import DateFilter from "./DateFilter";
import Selection, { FiltersForField, MultiselectFilter } from "./Selection";
import type { FilterInfo } from "./Selection";
import Signatures, { SignatureInfo } from "./Signatures";
import SignatureDetail from "./SignatureDetail";
import Pings, { PingInfo } from "./Pings";
import PingDetail from "./PingDetail";
import Link from "./Link";
import { allPings, setDates } from "app/data/source";
import Layout from "./Layout";
import SourceStatus from "./SourceStatus";
import { loadAndPopulateSettings } from "app/settings";

function osVersionName(os: string): ((version: string) => string | undefined) | undefined {
    function windows_nt_10_label(version: string): string {
        const [_ntversion, build] = version.split("@", 1);
        if (parseInt(build) >= 22000) {
            return 'Windows 11';
        }
        else {
            return 'Windows 10';
        }
    }

    const OS_VERSION_NAMES: { [key: string]: { [prefix: string]: string | ((version: string) => string) } } = {
        "Mac": {
            "19.": 'macOS 10.15 "Catalina"',
            "20.": 'macOS 11 "Big Sur"',
            "21.": 'macOS 12 "Monterey"',
            "22.": 'macOS 13 "Ventura"',
            "23.": 'macOS 14 "Sonoma"',
            "24.": 'macOS 15 "Sequoia"',
        },
        "Windows": {
            "5.1": 'Windows XP',
            "5.2": 'Windows XP',
            "6.0": 'Windows Vista',
            "6.1": 'Windows 7',
            "6.2": 'Windows 8',
            "6.3": 'Windows 8.1',
            "10.0": windows_nt_10_label
        },
    };

    if (os in OS_VERSION_NAMES) {
        const names = Object.entries(OS_VERSION_NAMES[os]);
        return (version: string) => {
            const match = names.find(([k, _]) => version.startsWith(k));
            if (match) {
                const name = match[1];
                if (typeof name == "string") {
                    return name;
                } else {
                    return name(version);
                }
            }
        };
    }
}

function osVersionCreateValue(os: string): ((value: number, version: string) => { value: number, label: string, group?: string }) {
    const versionName = osVersionName(os);
    return (value: number, version: string) => {
        if (versionName) {
            const group = versionName(version);
            if (group) {
                return { label: `${group} (${version})`, group, value };
            }
        }
        return { value, label: version };
    };
}

function osVersionFilter(os: string) {
    const createValue = osVersionCreateValue(os);
    return html`<${MultiselectFilter} field="osversion" prettyName=${`${os} version`}
        requires=${{ os }} createValue=${createValue} />`;
}

export default function App() {
    const [selectedPings, setSelectedPings] = createSignal([]);
    const [selectedSignature, setSelectedSignature] = createSignal<SignatureInfo>();
    const [filterInfo, setFilterInfo] = createSignal<FilterInfo>();
    const [selectedPing, setSelectedPing] = createSignal<PingInfo>();
    const [settingsLoaded, setSettingsLoaded] = createSignal(false);

    loadAndPopulateSettings(() => setSettingsLoaded(true));

    const loadingSources = () => html`
        <div style=${{ width: "50ch" }}>
            <h2>Loading...</h2>
            <${SourceStatus} />
        </div>
    `;

    const main = () => html`
        <${Layout} column>
            <${Layout} row size="content" element="header">
                <${Layout} size="content">
                    <h1>Crash Pings</h1>
                <//>
                <${Layout} size="content">
                    <${DateFilter} dates=${setDates} />
                <//>
                <${Layout} fill=1 />
                <${Layout} size="content">
                    <${Link} />
                <//>
            <//>
            <${Suspense} fallback=${loadingSources}>
                <${Layout} row element="main">
                    <${Layout} size="14em">
                        <${Selection} pings=${allPings} selectedPings=${setSelectedPings} filterInfo=${setFilterInfo}>
                            <${MultiselectFilter} field="channel" />
                            <${MultiselectFilter} field="process" />
                            <${MultiselectFilter} field="ipc_actor" prettyName="utility ipc actor"
                                requires=${{ "process": "utility" }} />
                            <${MultiselectFilter} field="version" />
                            <${MultiselectFilter} field="os" />
                            <${FiltersForField} field="os">${osVersionFilter}<//>
                            <${MultiselectFilter} field="arch" />
                        <//>
                    <//>
                    <${Layout} column>
                        <${Layout} frame>
                            <${Signatures} pings=${selectedPings} sort="clients" selectedSignature=${setSelectedSignature}><//>
                        <//>
                        <${Show} when=${selectedSignature}>
                            <${Layout} frame size="content" "aria-live"="polite">
                                <${SignatureDetail} signature=${selectedSignature} filterInfo=${filterInfo}><//>
                            <//>
                        <//>
                    <//>
                    <${Layout} column>
                        <${Show} when=${selectedSignature}>
                            <${Layout} frame "aria-live"="polite">
                                <${Pings} signature=${selectedSignature} selectedPing=${setSelectedPing}><//>
                            <//>
                            <${Show} when=${selectedPing}>
                                <${Layout} frame "aria-live"="polite">
                                    <${PingDetail} ping=${selectedPing}><//>
                                <//>
                            <//>
                        <//>
                    <//>
                <//>
            <//>
        <//>
    `;

    return html`<${Show} when=${settingsLoaded}>${main}<//>`;
};
