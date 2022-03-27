//
try {(code => {
    var {classes: Cc, interfaces: Ci, utils: Cu} = Components;
    var jsval, evl = true, re = e => Cu.reportError(e), imp = name => {try {
        return Cu.import(`resource://gre/modules/addons/${name}.jsm`, {});
    } catch(ex) {}}
    if ((jsval = imp("AddonSettings"))) {
        jsval.AddonSettings = {ADDON_SIGNING: false, REQUIRE_SIGNING: false, ALLOW_LEGACY_EXTENSIONS: true};
        try {evl = jsval.eval("this") === jsval;} catch(ex) {evl = false;}
    }
    var jsvals = ["XPIProvider", "XPIInstall"].map(imp).filter(i => i);
    jsvals[0].AddonSettings && lockPref("extensions.allow-non-mpc-extensions", true);
    jsvals[0].signaturesNotRequired = true;

    if (evl) return jsvals.forEach(jsval => {try {jsval.eval(code);} catch(ex) {re(ex);}});

    var sl = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
    Cu.importGlobalProperties(["URL", "Blob"]); var url = URL.createObjectURL(new Blob([(code)]));
    jsvals.forEach(jsval => {try {sl.loadSubScript(url, jsval);} catch(ex) {re(ex);}});

})(String.raw`((vzss, pckg) => {
    var trueDesc = {enumerable: true, value: true};
    typeof Extension == "function" && Object.defineProperty(Extension.prototype, "experimentsAllowed", trueDesc);
    "AddonInternal" in this && Object.defineProperty(AddonInternal.prototype, "providesUpdatesSecurely", trueDesc);
    this.isDisabledLegacy = () => false;
    if ("XPIDatabase" in this) this.XPIDatabase.isDisabledLegacy = () => false;
    try {SIGNED_TYPES.clear();} catch(ex) {};

    if (!vzss && !pckg) return;

    var re = /\x06\x03U\x04\x03..(\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}|[a-z0-9-\._]*\@[a-z0-9-\._]+)0\x82\x02"0\r\x06\t/i;
    var getUUID = () => {
        var gen = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator);
        return (getUUID = () => gen.generateUUID().toString())();
    }
    var getIdFromString = str => {
        var match = str && str.match(re);
        return match ? match[1] : getUUID();
    }
    var getState = arg => ({
        signedState: AddonManager.SIGNEDSTATE_NOT_REQUIRED,
        cert: typeof arg == "object" ? arg : {commonName: arg}
    });
    var checkAddon = addon => {
        if (addon.id || (
            "_installLocation" in addon
                ? addon._installLocation.name == KEY_APP_TEMPORARY
                : addon.location.isTemporary
        ))
            return getState(null);
    }
    var getRoot = () =>
        !AppConstants.MOZ_REQUIRE_SIGNING && Services.prefs.getBoolPref(PREF_XPI_SIGNATURES_DEV_ROOT, false)
            ? Ci.nsIX509CertDB.AddonsStageRoot : Ci.nsIX509CertDB.AddonsPublicRoot;

    if (vzss) {
        var getURI = file => {
            var jsval = Cu.import("resource://gre/modules/addons/XPIProvider.jsm", {});
            return (getURI = file => jsval.getURIForResourceInFile(file, "META-INF/mozilla.rsa"))(file);
        }
        var getIdFromFile = file => {
            var str, is = {close() {}}, sis = {close() {}};
            try {
                is = Services.io.newChannelFromURIWithLoadInfo(getURI(file), null).open();
                sis = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
                sis.init(is);
                str = sis.readBytes(sis.available());
            } catch(ex) {}
            sis.close(); is.close();
            return getIdFromString(str);
        }
        this.verifyZipSignedState = function verifyZipSignedState(aFile, aAddon) {
            var res = checkAddon(aAddon);
            return res ? Promise.resolve(res) : new Promise(resolve => {
                var callback = {openSignedAppFileFinished(rv, zipReader, cert) {
                    zipReader && zipReader.close();
                    resolve(getState(cert || getIdFromFile(aFile)));
                }};
                gCertDB.openSignedAppFileAsync(getRoot(), aFile, callback.wrappedJSObject = callback);
            });
        }
    }

    if (pckg) Package.prototype.verifySignedState = function verifySignedState(addon) {
        var res = checkAddon(addon);
        return res ? Promise.resolve(res) : new Promise(resolve =>
            this.verifySignedStateForRoot(addon, getRoot()).then(({cert}) => {
                if (cert)
                    resolve(getState(cert));
                else
                    this.readBinary("META-INF", "mozilla.rsa").then(
                        buffer => resolve(getState(
                            getIdFromString(String.fromCharCode(...new Uint8Array(buffer)))
                        )),
                        () => resolve(getState(getUUID()))
                    );
            }, Cu.reportError)
        );
    }
})(
    "verifyZipSignedState" in this, typeof Package == "function"
);`)} catch(err) {
    err.message != "Components is not defined" && Components.utils.reportError(err);
}
