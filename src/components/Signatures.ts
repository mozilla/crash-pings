import type { Ping } from "../data/source";
import type { StringIndex } from "../data/format";
import { allPings } from "../data/source";
import { createMemo, createEffect, on } from "solid-js";
import html from "solid-js/html";
import SingleSelectable from "./Selectable";

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

export default function Signatures(props: {
    sort: "clients" | "pings",
    pings: Ping[],
    selectedSignature?: (info: SignatureInfo | undefined) => void,
}) {
    const selectSignature = (sig: SignatureInfo | undefined) => {
        SignatureInfo.setSelected(sig);
        if (props.selectedSignature) {
            props.selectedSignature(sig);
        }
    }

    // Clear the selected signature whenever the pings change.
    createEffect(on(() => props.pings, () => selectSignature(undefined)));

    const processed = createMemo(() => {
        const pingData = allPings();
        const allSignatures = pingData.signature;
        const allClients = pingData.clientid;

        const countClients = (pings: Ping[]): number => new Set(pings.map(p => allClients.values[p])).size;

        const bySignature = props.pings.reduce((map, ping) => {
            const signature = allSignatures.values[ping];
            if (signature !== 0) {
                if (!map.has(signature)) {
                    map.set(signature, new SignatureInfo(allSignatures.getString(signature)!));
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

        return { signatures, totalPings, totalClients };
    });

    const sortedSignatures = createMemo(() => {
        const { signatures, totalPings, totalClients } = processed();
        const sortVal = props.sort == "clients" ? (s: SignatureInfo) => s.clientCount : (s: SignatureInfo) => s.pingCount;
        const percTotal = props.sort == "clients" ? totalClients : totalPings;

        for (const sig of signatures) {
            sig.percentage = sortVal(sig) * 100 / percTotal;
        }

        return signatures.sort((a, b) => b.percentage - a.percentage);
    });

    const header = () => {
        const { signatures, totalPings, totalClients } = processed();
        return html`<header>
            ${signatures.length} signatures, ${totalClients} clients, ${totalPings} crash pings
        </header>`;
    };

    const signatures = () => {
        return sortedSignatures().map((sig, idx) => html`
          <div onClick=${(_: Event) => selectSignature(sig)} class="signature listitem" classList=${() => sig.selectedClassList}>
            <div class="hdr-rank">${idx + 1}</div>
            <div class="hdr-percent">${sig.percentage.toFixed(1)}%</div>
            <div class="hdr-signature"><tt>${sig.signature}</tt></div>
            <div class="hdr-rightpanel">
              <div class="hdr-search"><span title="Copy signature to clipboard" onclick="copyText('${sig.signature}')" class="icon fas fa-copy copyicon"></span></div>
              <div class="hdr-search"><a href='https://crash-stats.mozilla.org/search/?signature=~${encodeURIComponent(sig.signature)}' target="_blank" title="Search for signature"><span class="icon fas fa-signature"></span></a></div>
              <div class="hdr-clientcount">${sig.clientCount}</div>
              <div class="hdr-count">${sig.pingCount}</div>
            </div>
          </div>
        `);
    };

    return html`<div>
        ${header}
        <div class="listheader">
            <div class="hdr-rank">rank</div>
            <div class="hdr-percent">%</div>
            <div class="hdr-signature">signature</div>
            <div class="hdr-rightpanel">
            <div class="hdr-search"></div>
            <div class="hdr-search"></div>
            <div class="hdr-clientcount">clients</div>
            <div class="hdr-count">count</div>
            </div>
        </div>
        ${signatures}
    </div>`;
}
