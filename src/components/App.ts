import { createSignal, Suspense } from "solid-js";
import html from "solid-js/html";
import DateFilter from "./DateFilter";
import Selection, { FiltersForField, MultiselectFilter } from "./Selection";
import type { FilterInfo } from "./Selection";
import Signatures, { SignatureInfo } from "./Signatures";
import SignatureDetail, { PingInfo } from "./SignatureDetail";
import PingDetail from "./PingDetail";
import { allPings, setSources } from "../data/source";
import Layout from "./Layout";

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

    const setDates = (dates: string[]) => setSources(dates.map(date => `ping_data/${date}`));

    return html`
    <${Layout} column>
        <${Layout} row size="content">
            <header>Crash Pings</header>
            <${DateFilter} dates=${setDates} />
        <//>
        <${Suspense} fallback=${html`<p>Loading data...</p>`}>
            <${Layout} row>
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
                <${Layout}>
                    <${Signatures} pings=${selectedPings} sort="clients" selectedSignature=${setSelectedSignature}><//>
                <//>
                <${Layout} column>
                    <${Layout}>
                        <${SignatureDetail} signature=${selectedSignature} filterInfo=${filterInfo} selectedPing=${setSelectedPing}><//>
                    <//>
                    <${Layout}>
                        <${PingDetail} ping=${selectedPing}><//>
                    <//>
                <//>
            <//>
        <//>
    <//>
    `;
};
