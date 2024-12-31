// ==UserScript==
// @name         Remove MyHeritage Junk Matches
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Hides low confidence matches from MyHeritage's DNA match list to make browsing more efficient
// @updateURL    https://raw.githubusercontent.com/mrjrt/userscripts/refs/heads/master/Remove%20MyHeritage%20Junk%20Matches.js
// @downloadURL  https://raw.githubusercontent.com/mrjrt/userscripts/refs/heads/master/Remove%20MyHeritage%20Junk%20Matches.js
// @author       You
// @match        https://www.myheritage.com/dna/matches/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=myheritage.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function doIt(){
        document.querySelectorAll("div.dna_match_card").forEach(function(e){
            if(e.innerText.indexOf("confidence") !== -1){
                e.remove();
            }
        })
        window.setTimeout(doIt, 1000)
    }
    window.setTimeout(doIt, 1000)
})();
