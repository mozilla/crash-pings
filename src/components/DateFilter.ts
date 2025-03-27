import html from "solid-js/html";
import { createSignal, untrack, Show } from "solid-js";

function dateString(date: Date): string {
    const s = date.toISOString();
    return s.substring(0, s.indexOf("T"));
}

const DAY_MILLIS = 1000 * 60 * 60 * 24;

export default function DateFilter(props: {
    dates: (dates: string[]) => void
}) {
    const now = Date.now();
    const now_day = Math.floor(now / DAY_MILLIS);
    const [currentDates, setCurrentDates] = createSignal({
        start: new Date((now_day - 7) * DAY_MILLIS),
        end: new Date((now_day - 1) * DAY_MILLIS),
    });
    const [startDate, setStartDate] = createSignal(currentDates().start);
    const [endDate, setEndDate] = createSignal(currentDates().end);

    const updateDates = () => {
        const dates = [];
        const start = untrack(startDate);
        const end = untrack(endDate);
        setCurrentDates({ start, end });
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
        const current = currentDates();
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

    return html`<fieldset style=${{ border: 0, padding: 0, display: "flex", "flex-direction": "row", "align-items": "baseline", gap: "1ch" }}>
        <legend style=${{ "font-size": "0.8em" }}>Submission Date</legend>
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
