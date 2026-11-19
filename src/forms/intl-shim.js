/*
 * The edge runtime has no `Intl`, but the DOM library creates an
 * Intl.NumberFormat when it loads (only used to serialise CSS numbers, which
 * form rendering never does). This minimal stand-in lets it load; it must be
 * imported before the DOM library.
 */
if (typeof globalThis.Intl === 'undefined') {
  globalThis.Intl = {
    NumberFormat: class {
      // eslint-disable-next-line class-methods-use-this
      format(value) {
        return String(Number(Number(value).toFixed(6)));
      }
    },
  };
}
