// background.js

// CONSTANTS
const filter = { urls: ["<all_urls>"] }; // Added as 2nd param to each Listener
const TIMEOUT_MINUTES = 2
const TIMEOUT = TIMEOUT_MINUTES * 60000

// HELPER FUNCTIONS
// Find all header values in a header object 
function findHeaders(name, headerList) {
    name = name.toLowerCase();
    var data = [];
    for (var i = 0; i < headerList.length; i++) {
        let header = headerList[i];
        if (name == header.name.toLowerCase()) {
            data.push(header.value);
        }
    }
    return data;
}

// Log all current cookies
function logCookies() {
    chrome.cookies.getAll(
        {},
        function(cookieList) {
            for (var i = 0; i < cookieList.length; i++) {
                var cookie = cookieList[i];
                console.log(cookie.name + "::" + cookie.value + "::" + cookie.domain);
            }
        }
    );
}

// args: cookieName to find, cookieList of present cookies
// returns: cookie object if found, otherwise null
function findCookie(cookieName, cookieList) {
    for (const cookie of cookieList) {
        if (cookie.name == cookieName) {
            return cookie;
        }
    }
    return null;
}

// args: cookieStr a list of cookies in string format
// i.e. <cookie-name>=<cookie-value>; <cookie-name>=<cookie-value>; ...
// returns: an array of cookie names
function parseCookies(cookieStr) {
    var cookieArray = [];
    while (cookieStr) {
        const name = cookieStr.slice(0, cookieStr.indexOf("="));
        cookieArray.push(name);
        const nxtIdx = cookieStr.indexOf(";");
        if (nxtIdx == -1) {
            cookieStr = "";
        } else {
            cookieStr = cookieStr.slice(nxtIdx + 2);
        }
    }
    return cookieArray;
}

function createAlert(details, expiredCookies) {
    var alertmsg = "REFRESHING COOKIES sent to " + details.url + ":";
    let processCookie = cookie => {
        if (!details.initiator || details.initiator.includes(cookie.domain)) {
            alertmsg += "\n- name: " + cookie.name;
        } else {
            alertmsg += "\n- ALERT CROSS-ORIGIN name: " + cookie.name + ", original cookie domain: " + cookie.domain; 
        }
    };
    expiredCookies.forEach(processCookie);
    return alertmsg;
}

// We add an event listener that checks if the URL associated with the request
// is part of the store of cookies we are monitoring. If it is, then we ensure
// that the cookie has not timed out. Otherwise, we alert the user before
// sending over the appropriate cookies. As detailed in the paper, we would like
// to extend this to a prompt, to give the user the option to delete the cookies
// before submitting a request. We would also like to implement subdomain and
// and path matching consistent with cookie policies.

chrome.webRequest.onBeforeSendHeaders.addListener(
    function(details) {
        const sentCookies = findHeaders("Cookie", details.requestHeaders)[0];
        if (!sentCookies) {
            return;
        }
        chrome.storage.local.get("cookies", function(result) {
            if (result["cookies"]) {
                var newResult = result["cookies"];
                const cookieSet = new Set(parseCookies(sentCookies));
                const dbCookies = newResult.filter(cookie => cookieSet.has(cookie.name));
                const now = Date.now();
                const expiredCookies = dbCookies.filter(cookie => cookie.timeout < now);
                // handler expiredCookies accordingly. Here we just prompt with
                // some special info if the cookie is a cross origin
                if (expiredCookies.length != 0) {
                    const alertMsg = createAlert(details, expiredCookies);
                    alert(alertMsg);
                }
                expiredCookies.forEach(cookie => cookie.timeout = now + TIMEOUT);
                chrome.storage.local.set({cookies: newResult}, null);
            }
        });
    },
    filter,
    [
        "requestHeaders", // include request headers in `details` param
        "extraHeaders", // include non-default request headers in `details` param
        "blocking" // callback function should be run localhronously, blocking the outoging request until done
    ]
);


// When we receive a new header with cookies, we add the corresponding value
// and domain to our cookie store. In the future, we would like to better
// support domain and path matching.
chrome.webRequest.onHeadersReceived.addListener(
    function(details) {
        const cookie = findHeaders("Set-Cookie", details.responseHeaders);
        if (cookie.length != 0) {
            for (var i = 0; i < cookie.length; i++) {
                const cookieName = cookie[i].slice(0, cookie[i].indexOf("="));
                const pathIdx = cookie[i].toLowerCase().indexOf("path");
                var cookiePath;
                if (pathIdx == -1) {
                    cookiePath = null;
                } else {
                    const pathStr = cookie[i].slice(pathIdx);
                    cookiePath = pathStr.slice(pathStr.indexOf("=") + 1, pathStr.indexOf(";"));
                }
                const domainIdx = cookie[i].toLowerCase().indexOf("domain");
                var cookieDomain;
                if (domainIdx == -1) {
                    cookieDomain = null;
                } else {
                    const domainStr = cookie[i].slice(domainIdx);
                    cookieDomain = domainStr.slice(domainStr.indexOf("=") + 1, domainStr.indexOf(";"));
                }
                chrome.storage.local.get("cookies", function(result) {
                    var newResult;
                    var domainSet = cookieDomain ? true : false;
                    var pathSet = cookiePath ? true : false;
                    var url = new URL(details.url);
                    var domain = cookieDomain ? cookieDomain : url.hostname;
                    var path = cookiePath ? cookiePath : url.pathname;
                    var newCookie = {
                        timeout: Date.now() + TIMEOUT,
                        name: cookieName,
                        domain: domain,
                        domainSet: domainSet,
                        path: path,
                        pathSet: pathSet,
                    };
                    if (result["cookies"]) {
                        newResult = result["cookies"];
                        var foundCookie = findCookie(cookieName, newResult);
                        if (foundCookie) {
                            foundCookie = newCookie;
                        } else {
                            newResult.push(newCookie);
                        }
                    } else {
                        newResult = [newCookie];
                    }
                    chrome.storage.local.set({cookies: newResult}, null);
                });
            }
        }
    },
    filter,
    [
        "responseHeaders", // include response headers in `details` param
        "extraHeaders", // include non-default request headers in `details` param
        "blocking" // callback function should be run localhronously, blocking the outoging request until done
    ]
);

// This function would be used to remove 'expired' cookies that the user has
// chosen not to renew.
function removeCookies(site, cookieList) {
    for (var i = 0; i < cookieList.length; i++) {
        let cookieName = cookieList[i];
        chrome.cookies.get(
            { url: site, name: cookieName},
            function(cookie) {
                if (!cookie) {
                    console.log("Cookie not found for " + cookieName);
                    return;
                }
                chrome.cookies.remove(
                    {
                        url: site,
                        name: cookie.name
                    }
                );
            }
        );
    }
}

// this is an example of deleting cookies associated with the facebook domain
const fbCookieList = [
    "sb",
    "datr"
];
// removeCookies("https://facebook.com", fbCookieList);
