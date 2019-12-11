// This is some starter code for creating a prompt to allow the user
// to either send or delete cookies that have expired.

(function() {
    var CONTENT; 
    CONTENT = "<button id='send'>send cookies</button> <button id='no'>no</button>";
    container = document.createElement('div');
    container.innerHTML = CONTENT;

    document.getElementById("send").addEventListener("click", function() {
        chrome.runtime.sendMessage("send");
    });

    document.getElementById("no").addEventListener("click", function() {
        chrome.runtime.sendMessage("no");
    });
}).call(this)