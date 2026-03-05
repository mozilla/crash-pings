import { render } from "solid-js/web";
import html from "solid-js/html";
import { Router, Route } from "@solidjs/router";
import App from "./components/App";

render(() => html`
    <${Router}>
        <${Route} path="/" component=${App} />
    <//>
`, document.body)
