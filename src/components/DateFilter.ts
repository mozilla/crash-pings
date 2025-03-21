import html from "solid-js/html";

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
    let startDate = new Date((now_day - 7) * DAY_MILLIS);
    let endDate = new Date((now_day - 1) * DAY_MILLIS);
    const updateDates = () => {
        const dates = [];
        let d = startDate;
        while (d <= endDate) {
            dates.push(dateString(d));
            d = new Date(d.getTime() + DAY_MILLIS);
        }
        props.dates(dates);
    };

    // Set initial dates. No reason to wait for mount.
    updateDates();

    return html`<div>
        <label for="start-date">Start:</label>
        <input type="date" name="start-date"
            onChange=${(e: Event) => startDate = (e.currentTarget! as HTMLInputElement).valueAsDate!}
            value=${dateString(startDate)}
            >
        <label for="end-date">End:</label>
        <input type="date" name="end-date"
            onChange=${(e: Event) => endDate = (e.currentTarget! as HTMLInputElement).valueAsDate!}
            value=${dateString(endDate)}
            >
        <button onClick=${(_: Event) => updateDates()}>Load</button>
    </div>`;
}
