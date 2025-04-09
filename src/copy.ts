export default function copyText(s: string) {
    if (typeof (navigator.clipboard) == 'undefined') {
        alert('Cannot access clipboard');
        return;
    }
    navigator.clipboard.writeText(s)
        .catch(error => {
            alert(`Failed to write to clipboard: ${error.message}`);
        });
}
