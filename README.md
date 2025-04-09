# Firefox crash pings web application

This web app displays and allows dynamic filtering of Firefox crash ping details. It is currently
set up to be hosted on netlify (and uses netlify functions and the blob store). It is normally
hosted at crash-pings.mozilla.com.

[bun][] is used to build and develop the application.

The website uses [solidjs][] as a small frontend reactivity library. Because `bun` does not yet
support solidjs-flavored JSX (though support is planned), [solidjs html template
literals](https://github.com/solidjs/solid/tree/main/packages/solid/html) are used for rendering
components.

## Runtime environment
The [.tool-versions](.tool-versions) file specifies necessary tools to use. This is compatible with
[asdf](https://asdf-vm.com/) and other tools like [mise](https://mise.jdx.dev/).

At runtime, the following environment variables must be defined:
* `GOOGLE_APPLICATION_CREDENTIALS_JSON`: the JSON content of a google application credentials file.
* `NETLIFY_LOCAL_PSK`: an arbitrary shared key used by the ping data functions.

### Development
Run `bun dev` to launch the netlify-cli dev server. This handles launching the bun server as well as
the netlify functions.

## Storage
Netlify Blobs are used to store condensed ping data as well as saved links.

### Ping condensation
Ping data is huge and repetitive. We condense the data by deduplicating strings and changing the
data into a struct-of-arrays of integers referring to the strings. This makes loading the data in
the frontend very fast and very low-memory. It also has the follow-on effect of allowing efficient
filtering of the data, as it can all be done using integers (`O(1)` equality comparison as opposed
to string `O(chars)` worst-case comparison, not to mention data locality using `TypedArray`s).

### Links
We save links because it would be unwieldy to store the settings in the URL. This essentially acts
as a URL shortener for convenience, though users can also create named links.


[bun]: bun.sh
[solidjs]: solidjs.com
