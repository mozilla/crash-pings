import type { Ping } from "app/data/source";
import type { StringIndex } from "app/data/format";
import { allPings } from "app/data/source";
import { createMemo, createEffect, on, untrack } from "solid-js";
import html from "solid-js/html";
import SingleSelectable from "app/components/Selectable";
import Layout from "app/components/Layout";
import { VList } from "virtua/solid";
import settings from "app/settings";
import copyText from "app/copy";
import "./component.css";

export class SignatureInfo extends SingleSelectable(Object) {
    signature: string;
    pings: Ping[] = [];
    clientCount: number = 0;
    percentage: number = 0;

    get pingCount() { return this.pings.length; }

    constructor(signature: string) {
        super();
        this.signature = signature;
    }
}

type SortBy = "clients" | "pings";

export default function Signatures(props: {
    pings: Ping[],
    selectedSignature?: (info: SignatureInfo | undefined) => void,
}) {
    const selectSignature = (sig: SignatureInfo | undefined) => {
        SignatureInfo.setSelected(sig);
        settings.signature = sig?.signature;
        if (props.selectedSignature) {
            props.selectedSignature(sig);
        }
    }

    const processed = createMemo(() => {
        const pingData = allPings();
        const allSignatures = pingData.signature;
        const allClients = pingData.clientid;

        const countClients = (pings: Ping[]): number => new Set(pings.map(p => allClients.values[p])).size;

        const bySignature = props.pings.reduce((map, ping) => {
            const signature = allSignatures.values[ping];
            if (signature !== 0) {
                if (!map.has(signature)) {
                    map.set(signature, new SignatureInfo(allSignatures.strings[signature]));
                }
                map.get(signature)!.pings.push(ping);
            }
            return map;
        }, new Map<StringIndex, SignatureInfo>());

        const signatures = bySignature.values().toArray();

        for (const sig of signatures) {
            sig.clientCount = countClients(sig.pings);
        }

        const [totalPings, totalClients] = signatures.reduce(
            ([p, c], data) => [p + data.pingCount, c + data.clientCount],
            [0, 0]
        );

        // Load settings
        {
            const signature = untrack(() => settings.signature);
            if (signature) {
                const sig = signatures.find(sig => sig.signature == signature);
                if (sig) {
                    selectSignature(sig);
                }
            }
        }

        return { signatures, totalPings, totalClients };
    });

    // Clear the selected signature whenever the pings change.
    let firstRun = true;
    createEffect(on(() => props.pings, () => {
        if (firstRun) {
            firstRun = false;
            return;
        }
        selectSignature(undefined);
    }));

    const sortedSignatures = createMemo(() => {
        const { signatures, totalPings, totalClients } = processed();
        const sortVal = settings.sort == "clients" ? (s: SignatureInfo) => s.clientCount : (s: SignatureInfo) => s.pingCount;
        const percTotal = settings.sort == "clients" ? totalClients : totalPings;

        for (const sig of signatures) {
            sig.percentage = sortVal(sig) * 100 / percTotal;
        }

        return signatures.sort((a, b) => b.percentage - a.percentage);
    },
        undefined,
        // We always return the same value (the signatures array), but modify
        // it internally as an optimization, so we set `equals: false` to
        // always signal a change.
        { equals: false }
    );

    const header = () => {
        const { signatures, totalPings, totalClients } = processed();
        return html`<h2>
            ${signatures.length} signatures, ${totalClients} clients, ${totalPings} crash pings
        </h2>`;
    };

    const selectOn = (which: SortBy) => () => {
        return { "selected": settings.sort == which };
    };

    const renderSignature = (sig: SignatureInfo, idx: number) => {
        const url = `https://crash-stats.mozilla.org/search/?signature=~${encodeURIComponent(sig.signature)}`;
        return html`
          <div role="row" onClick=${(_: Event) => selectSignature(sig)} class="listrow" classList=${() => sig.selectedClassList}>
            <div role="cell" class="rank">${idx + 1}</div>
            <div role="cell" class="percent">${sig.percentage.toFixed(2)}%</div>
            <div role="cell" class="signature"><tt>${sig.signature}</tt></div>
            <div role="cell" class="copy"><span role="button" title="Copy signature to clipboard" onClick=${(_: Event) => copyText(sig.signature)}><span aria-hidden class="icon fas fa-copy copyicon"></span></span></div>
            <div role="cell" class="search"><a href=${url} target="_blank" title="Search for signature"><span aria-hidden class="icon fas fa-signature"></span></a></div>
            <div role="cell" class="clients">${sig.clientCount}</div>
            <div role="cell" class="count">${sig.pingCount}</div>
          </div>
        `;
    };

    return html`<${Layout} column gap=${false}>
        <${Layout} size="content">
            ${header}
            <div role="row" class="listheader listrow">
                <div role="columnheader" class="rank">rank</div>
                <div role="columnheader" class="percent">%</div>
                <div role="columnheader" class="signature">signature</div>
                <div role="columnheader" class="copy"></div>
                <div role="columnheader" class="search"></div>
                <div role="columnheader" class="clients">
                    <span role="button" title="Sort by client count"
                        onClick=${(_: Event) => settings.sort = "clients"}
                        classList=${selectOn("clients")}
                        >
                        clients
                    </span>
                </div>
                <div role="columnheader" class="count">
                    <span role="button" title="Sort by ping count"
                        onClick=${(_: Event) => settings.sort = "pings"}
                        classList=${selectOn("pings")}
                        >
                        count
                    </span>
                </div>
            </div>
        <//>
        <${Layout} fill>
            <${VList} role="rowgroup" data=${sortedSignatures}>${renderSignature}<//>
        <//>
    <//>`;
}
