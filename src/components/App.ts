import { createSignal, Suspense, Show, type JSX, createEffect } from "solid-js";
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

function Summarized(props: {
    when: boolean,
    reset: (_?: never) => void,
    children: JSX.Element[],
}) {
    return html`<${Show} when=${() => props.when} fallback=${() => props.children.slice(1)}>
        <${Layout} aria-live="polite" frame size="content">
            <div style="display: flex; align-items: baseline; padding: 4px; gap: 4px" role="button" title="Click to edit" onClick=${(_: Event) => props.reset()}>
                <${Layout} size="content">
                    <span aria-hidden="true" class="fa-solid fa-chevron-left"></span>
                <//>
                <${Layout}>${() => props.children[0]}<//>
            </div>
        <//>
    <//>`;
}

const EM_SIZE = parseFloat(getComputedStyle(document.body).fontSize);

function isWideWindow() {
    return window.innerWidth > 100 * EM_SIZE;
}

export default function App() {
    const [selectedPings, setSelectedPings] = createSignal([]);
    const [selectedSignature, setSelectedSignature] = createSignal<SignatureInfo>();
    const [filterInfo, setFilterInfo] = createSignal<FilterInfo>();
    const [selectedPing, setSelectedPing] = createSignal<PingInfo>();
    const [settingsLoaded, setSettingsLoaded] = createSignal(false);
    const [wideWindow, setWideWindow] = createSignal(isWideWindow());

    let resizeTimer: Timer | undefined;
    window.addEventListener("resize", () => {
        if (resizeTimer) {
            clearTimeout(resizeTimer);
        }
        resizeTimer = setTimeout(() => setWideWindow(isWideWindow()), 100);
    });

    loadAndPopulateSettings(() => setSettingsLoaded(true));

    const loadingSources = () => html`
        <div style=${{ width: "50ch" }}>
            <h2>Loading...</h2>
            <${SourceStatus} />
        </div>
    `;

    // We create shared components for the major UI elements so that if you
    // resize and the layout changes, we can reuse the components rather than
    // re-rendering. This also has the nice side effect of making the layouts
    // easy to read and compare.
    const selection = () => html`
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
    `;
    const signatures = () => html`
        <${Signatures} pings=${selectedPings} sort="clients" selectedSignature=${setSelectedSignature} />
    `;
    const signatureDetail = () => html`
        <${Show} when=${selectedSignature} keyed>
            ${(sig: SignatureInfo) => html`<${SignatureDetail} signature=${sig} filterInfo=${filterInfo} hideHeader=${() => !wideWindow()} />`}
        <//>
    `;
    const pings = () => html`
        <${Show} when=${selectedSignature} keyed>
            ${(sig: SignatureInfo) => html`<${Pings} signature=${sig} selectedPing=${setSelectedPing} />`}
        <//>
    `;
    const pingDetail = () => html`
        <${Show} when=${selectedPing} keyed>
            ${(ping: PingInfo) => html`<${PingDetail} ping=${ping} />`}
        <//>
    `;

    function wideLayout() {
        return html`
            <${Layout} row element="main">
                <${Layout} size="14em">${selection}<//>
                <${Layout} column>
                    <${Layout} frame>${signatures}<//>
                    <${Show} when=${selectedSignature}>
                        <${Layout} frame size="content" aria-live="polite">${signatureDetail}<//>
                    <//>
                <//>
                <${Layout} column>
                    <${Show} when=${selectedSignature}>
                        <${Layout} frame aria-live="polite">${pings}<//>
                        <${Show} when=${selectedPing}>
                            <${Layout} frame aria-live="polite">${pingDetail}<//>
                        <//>
                    <//>
                <//>
            <//>
        `;
    }


    function narrowLayout() {
        enum Displayed {
            Filters,
            Signatures,
            SignatureDetail,
            PingDetail
        }

        const [displayed, setDisplayed] = createSignal<Displayed>(Displayed.Filters);

        function SummarizeDisplayed(props: {
            level: Displayed,
            children: JSX.Element[],
        }) {
            return html`
            <${Show} when=${() => displayed() >= props.level}>
                <${Summarized} when=${() => displayed() > props.level} reset=${(_: never) => setDisplayed(props.level)}>
                    ${props.children}
                <//>
            <//>`;
        }

        // Transition appropriately when pings/signatures are selected.  We do
        // both in one effect to choose the correct state once (to prevent the
        // next effect from clearing state incorrectly).
        createEffect(() => {
            if (selectedPing() !== undefined) {
                setDisplayed(Displayed.PingDetail);
            } else if (selectedSignature() !== undefined) {
                setDisplayed(Displayed.SignatureDetail);
            }
        });

        // Clear selections on specific displays (we show selections as
        // summaries instead).
        createEffect(() => {
            const disp = displayed();
            if (disp < Displayed.PingDetail) {
                PingInfo.setSelected(undefined);
                setSelectedPing(undefined);
            }
            if (disp < Displayed.SignatureDetail) {
                SignatureInfo.setSelected(undefined);
                setSelectedSignature(undefined);
            }
        });

        return html`
            <${Layout} column element="main">
                <${SummarizeDisplayed} level=${Displayed.Filters}>
                    <${Selection.Summary} filterInfo=${filterInfo} />
                    <${Layout} column>
                        <${Layout}>${selection}<//>
                        <${Layout} row size="content">
                            <button style="flex: auto; padding: 8px" onClick=${(_e: Event) => setDisplayed(Displayed.Signatures)}>Show Signatures</button>
                        <//>
                    <//>
                <//>
                <${SummarizeDisplayed} level=${Displayed.Signatures}>
                    <${Signatures.Summary} selectedSignature=${selectedSignature} />
                    <${Layout} frame>${signatures}<//>
                <//>
                <${SummarizeDisplayed} level=${Displayed.SignatureDetail}>
                    <${Pings.Summary} selectedPing=${selectedPing} />
                    ${() => html`
                        <${Layout} frame size="content" aria-live="polite">${signatureDetail}<//>
                        <${Layout} frame aria-live="polite">${pings}<//>
                    `}
                <//>
                <${SummarizeDisplayed} level=${Displayed.PingDetail}>
                    <div></div>
                    ${() => html`<${Layout} frame aria-live="polite">${pingDetail}<//>`}
                <//>
            <//>
        `;
    }

    const main = () => wideWindow() ? wideLayout() : narrowLayout();

    return html`<${Show} when=${settingsLoaded}>
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
            <${Suspense} fallback=${loadingSources}>${main}<//>
        <//>
    <//>`;
};
