import html from "solid-js/html";
import { createSignal, untrack, Show } from "solid-js";
import settings from "app/settings";

function dateString(date: Date): string {
    const s = date.toISOString();
    return s.substring(0, s.indexOf("T"));
}

const DAY_MILLIS = 1000 * 60 * 60 * 24;

export default function DateFilter(props: {
    dates: (dates: string[]) => void
}) {
    const [startDate, setStartDate] = createSignal(settings.dates.start);
    const [endDate, setEndDate] = createSignal(settings.dates.end);

    const updateDates = () => {
        const dates = [];
        const start = untrack(startDate);
        const end = untrack(endDate);
        settings.dates.start = start;
        settings.dates.end = end;
        let d = start;
        while (d <= end) {
            dates.push(dateString(d));
            d = new Date(d.getTime() + DAY_MILLIS);
        }
        props.dates(dates);
    };

    // Set initial dates. No reason to wait for mount.
    updateDates();

    const showLoadButton = () => {
        const current = settings.dates;
        return startDate().getTime() !== current.start.getTime()
            || endDate().getTime() !== current.end.getTime();
    };

    const startChanged = (e: Event) => {
        const date = (e.currentTarget! as HTMLInputElement).valueAsDate!;
        setStartDate(date);
        if (date > endDate()) setEndDate(date);
    };
    const endChanged = (e: Event) => {
        const date = (e.currentTarget! as HTMLInputElement).valueAsDate!;
        setEndDate(date);
        if (date < startDate()) setStartDate(date);
    };

    return html`<fieldset style=${{ display: "flex", "flex-direction": "row", "align-items": "baseline", gap: "1ch" }}>
        <legend>Submission Date</legend>
        <input type="date"
            onChange=${startChanged}
            value=${() => dateString(startDate())}
            >
        <span>to</span>
        <input type="date"
            onChange=${endChanged}
            value=${() => dateString(endDate())}
            >
        <${Show} when=${showLoadButton}>
            <button onClick=${(_: Event) => updateDates()}>Load</button>
        <//>
    </fieldset>`;
}
