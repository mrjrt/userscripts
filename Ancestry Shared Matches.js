// ==UserScript==
// @name         Ancestry Shared Matches
// @namespace    http://qwerki.co.uk/
// @version      0.13
// @updateURL    https://raw.githubusercontent.com/mrjrt/userscripts/master/Ancestry%20Shared%20Matches.js
// @description  Make Ancestry's DNA section less tedious
// @author       Me.
// @include      *://*.ancestry.*/discoveryui-matches/match-list/*
// @include      *://*.ancestry.*/discoveryui-matches/compare/*/sharedmatches
// @include      file://*AncestryDNA® Matches*
// @grant        none
// ==/UserScript==

(async function() {
    'use strict';

    const writeSleep = 5000;
    const zeroSMatchesCacheExpiry = 604800000;
    const hasSMatchesCacheExpiry = 2592000000;
    const bulkOperationIntervalMilliseconds = 250;
    const autoScrollIntervalMilliseconds = 3000;
    const initalFixupTimeout = 500;
    const fixupTimeout = 60000;//360000;

    var myGuid = "<UNKNOWN>";
    var rx = /(match-list|compare)\/(.+?)(\/|$)/;
    myGuid = rx.exec(window.location.pathname)[2];

    const urlParams = new URLSearchParams(window.location.search);
    window.smatchmin = urlParams.get('smatchmin') ?? 1;
    window.smatchmax = urlParams.get('smatchmax');
    window.autoscroll = urlParams.get('autoscroll') ?? false;
    window.removesmatches = urlParams.get('removesmatches') ?? false;

    console.log(smatchmin + ", " + smatchmax + ", " + window.removesmatches + ", " + window.autoscroll);

    async function getGroups(){
        var backoff = 100;
        while(null == window.tagGroups) {
            var url = window.location.origin + "/discoveryui-matchesservice/api/samples/" + myGuid + "/tags";
            await sleep(backoff);
            if(null == window.tagGroups && myGuid != "<UNKNOWN>"){
                var xmlhttp = new XMLHttpRequest();
                xmlhttp.open("GET", url, false);
                try{
                    xmlhttp.send();
                    if(xmlhttp.status == 200){
                        var myArr = JSON.parse(xmlhttp.responseText);
                        window.tagGroups = myArr.reduce(function(map, obj){
                            map[obj.tagId] = obj;
                            return map;
                        }, {});
                    } else {
                        console.log(xmlhttp.status + "," + url)
                    }
                }catch( e) {
                    console.log(e + url)
                }
            }
            backoff = backoff + Math.floor(Math.random() * backoff);
        }
    }

    async function getMatchesGroups(matchGuid){
        var backoff = 100;
        var groups = null;
        while(null == groups) {
            var url = window.location.origin + "/discoveryui-matchesservice/api/samples/" + myGuid + "/matches/" + matchGuid + "/details";
            await sleep(backoff);
            if(null == groups){
                var xmlhttp = new XMLHttpRequest();
                xmlhttp.open("GET", url, false);
                try{
                    xmlhttp.send();
                    if(xmlhttp.status == 200){
                        groups = JSON.parse(xmlhttp.responseText).tags;
                    } else {
                        console.log(xmlhttp.status + "," + url)
                    }
                }catch( e) {
                    console.log(e + url)
                }
            }
            backoff = backoff + Math.floor(Math.random() * backoff);
        }
        return groups;
    }

    function fixup(){
       console.debug("firing?", );
    if(document.querySelectorAll(".noMatchDisplay").length > 0) {
        console.log("Crappy Ancestry engineering means we need to restart.");
        setTimeout(function(){
                if( null == document.evaluate("//match-entry-updated//*[contains(., 'across ')]", document, null, XPathResult.ANY_TYPE, null ).iterateNext()) {
                    window.location.search = window.location.search.concat(window.autoscroll ? "&autoscroll=true" : "");
                }
            },
            120000);
        }
        var matches = document.querySelectorAll("match-list match-entry-updated");
        matches.forEach(function(i){processMatch(i, visual)});
        matches.forEach(function(i){processMatch(i, removeStupidButton)});
        matches.forEach(function(i){processMatch(i, showAllGroups)});
//        matches.forEach(function(i){processMatch(i, star)});
   }

    async function always(url, smatchmin, smatchmax) {
        return true;
    }

    async function onlySharedMatches(url, smatchmin, smatchmax) {
        return !(smatchmin && localStorage.getWithExpiry("asm:" + url) < smatchmin) || (smatchmax && localStorage.getWithExpiry("asm:" + url) > smatchmax);
    }

    async function processMatch(matchElement, doIt, test, mode, groupText, groupId){
        var matchUrl = matchElement.querySelector("a.userCardTitle");

        if(myGuid == '<UNKNOWN>') {
            myGuid = getMyGuid(matchUrl);
        }

        var theirGuid = getTheirGuid(matchUrl);
        var url = window.location.origin + "/discoveryui-matchesservice/api/samples/" + myGuid + "/matches/list?page=1&relationguid=" + theirGuid;

        doIt(url, matchElement, myGuid, theirGuid, test, mode, groupText, groupId);
    }

    async function showAllGroups(url, matchElement, myGuid, theirGuid, test) {
        matchElement.querySelectorAll("div.additionalInfoCol .displayTextNum").forEach(async function(d){
            d.remove();

            (await getMatchesGroups(theirGuid)).forEach(async function(group){
                if(matchElement.querySelectorAll("span[title=\""+window.tagGroups[group].label+"\"]").length == 0){
                matchElement.querySelectorAll("div.additionalInfoCol .indicatorGroupCollection").forEach(function(parent){
                    var newIcon = document.createElement("span");
                    newIcon.className = "indicatorGroup tight";
                    newIcon.style.backgroundColor = window.tagGroups[group].color;
                    newIcon.title = window.tagGroups[group].label;
                    parent.insertBefore(newIcon, parent.querySelector(".indicatorGroup"));
                });
                }
            });
        });
    }

    async function removeStupidButton(url, matchElement, myGuid, theirGuid, test) {
        matchElement.querySelectorAll("div.additionalInfoCol.sharedDnaStuff").forEach(function(d){
            d.remove();
        });
    }

    async function visual(url, matchElement, myGuid, theirGuid, test) {
        await getMatches(url);
        await getRawDNA(url, myGuid, theirGuid);

        var hideSharedMatches = (window.smatchmin != null && (localStorage.getWithExpiry("asm:" + url) < window.smatchmin)) || (window.smatchmax != null && (localStorage.getWithExpiry("asm:" + url) > window.smatchmax));
        var sharedMatchesStyle = hideSharedMatches ? "style=\"color:#BBB\" " : "";
        if(hideSharedMatches && window.removesmatches){
            var e = matchElement.closest("MATCH-ENTRY-UPDATED");
            e.style.display = "none";
        } else {
            var cell = document.createElement("div");
            cell.className = "sharedmatches";
            cell.innerHTML = "<a class=\"icon iconSmatch\" href=\"" + window.location.origin + "/discoveryui-matches/compare/" + myGuid + "/with/" + theirGuid + "/sharedmatches\"" + sharedMatchesStyle + ">" + localStorage.getWithExpiry("asm:" + url) + " shared matches</a>";

            var parent = matchElement.querySelector(".treeInformation");
            var existing = parent.querySelector(".sharedmatches")
            if(!parent.querySelector(".sharedmatches")){
                parent.appendChild(cell);
            }
        }

        matchElement.querySelectorAll(".sharedDnaText div.link, div.sharedDnaText.link").forEach(function(d){
            if(!d.innerText.match("Timbered DNA")){
                url = window.location.origin + "/discoveryui-geneticfamilyservice/api/probability/" + myGuid + "/to/" + theirGuid + "/modal";
                var dna = localStorage.getWithExpiry("ard:" + url)
                d.innerText = "Shared DNA: " + dna.dna + " cM over " + dna.segments + " segment" + (dna.segments > 1 ? "s, longest: " + dna.longestSegment + " cM" : "") + (dna.tDNA != dna.dna ? ". Timbered DNA: " + dna.tDNA + " cM" : "");
            }
        });
    }

    async function filterTags(url, matchElement, myGuid, theirGuid, test) {
        var hide = (window.hideTags != null && window.hideTags.some(function(elem,index,hideTags){
            return matchElement.querySelectorAll(".additionalInfoCol .indicatorGroup[title=\"" + window.tagGroups[elem].label + "\"]").length > 0;
        }));
        var e = matchElement.closest("MATCH-ENTRY-UPDATED");
        if(hide){
            e.style.display = "none";
        } else {
            e.style.display = "block";
        }
    }

    async function filterSMatches(url, matchElement, myGuid, theirGuid, test) {
        await getMatches(url, myGuid, theirGuid);
        var hideSharedMatches = (window.smatchmin != null && (localStorage.getWithExpiry("asm:" + url) < window.smatchmin)) || (window.smatchmax != null && (localStorage.getWithExpiry("asm:" + url) > window.smatchmax));
        var e = matchElement.closest("MATCH-ENTRY-UPDATED");
        if(hideSharedMatches){
            e.style.display = "none";
        } else {
            e.style.display = "block";
        }
    }

    async function tagCore(url, matchElement, myGuid, theirGuid, test, mode, groupText, groupId) {
      //  await getMatches(url, myGuid, theirGuid);

        var shouldTag = await test(url, window.smatchmin, window.smatchmax);
        if(shouldTag && matchElement.style.display != "none"){
            var groupCount = matchElement.querySelectorAll(".additionalInfoCol .indicatorGroup").length;
            var starCount = matchElement.querySelectorAll(".additionalInfoCol .iconStar").length;
            var hasStar = matchElement.querySelectorAll(".additionalInfoCol .iconStar").length > 0;
            var hasSelectedGroup = matchElement.querySelectorAll(".additionalInfoCol .indicatorGroup[title=\"" + groupText + "\"]").length > 0;
            var has = groupText == "Star" ? hasStar : hasSelectedGroup;
            //console.log("cnt: " + groupCount + "," + starCount + "," + mode + ", " + group);
            console.log("group:" + groupText + ", mode:" + mode + ", has:" + has);
            //var actualMode = mode != "toggle" ? mode : (starCount == 0 ? "set" : "clear" );
            var actualMode = mode != "toggle" ? mode : (has == false ? "set" : "clear" );
            if((actualMode == "set" && !has ) || ( actualMode == "clear" && has )) {
                console.log("BulkAction: " + mode + ":" + has + " - " + theirGuid);
                await sleep(bulkOperationIntervalMilliseconds);

                var xmlhttp;
                var endpoint = groupText == "Star"
                    ? window.location.origin + "/discoveryui-matchesservice/api/samples/" + myGuid + "/matches/" + theirGuid
                    : window.location.origin + "/discoveryui-matchesservice/api/samples/" + myGuid + "/matches/" + theirGuid + "/tags/" + groupId;
                var method = "PUT";
                if(actualMode == "clear" && groupText != "Star") {
                    method = "DELETE";
                }
                var payload = groupText == "Star"
                    ? actualMode == "set"
                        ? `{"starred":true}`
                        : `{"starred":false}`
                    : actualMode == "set"
                        ? `{"headers":{"normalizedNames":{},"lazyUpdate":null,"lazyInit":null,"headers":{}}}`
                        : null;
                var backoff = 100;
                var attempt = 1;
                do{
                    xmlhttp = new XMLHttpRequest();
                    xmlhttp.open(method, endpoint, true);
                    xmlhttp.setRequestHeader("Content-Type", "application/json");
                    xmlhttp.onreadystatechange = function() {
                        if (this.status == 200) {
                            var parent = matchElement.querySelector(".additionalInfoCol .ng-star-inserted .indicatorGroupCollection");
                            if(actualMode == "set") {
                                if(null == parent.querySelector(groupText == "Star"
                                                                ? ".iconStar"
                                                                : ".indicatorGroup[title=\"" + groupText + "\"]")) {
                                    console.log(theirGuid + " successfully tagged as " + groupText);
                                    var newIcon = document.createElement("span");
                                    newIcon.className = groupText == "Star"
                                        ? "icon iconStar"
                                        : "indicatorGroup tight";
                                    newIcon.style.backgroundColor = groupText == "Star"
                                        ? null
                                        : window.tagGroups[groupId].color;
                                    newIcon.title = groupText == "Star"
                                        ? "Starred matches"
                                        : groupText;
                                    parent.insertBefore(newIcon, parent.querySelector(".indicatorGroupCollection .indicatorGroup"));
                                }
                            } else {
                                //console.log(parent.querySelector(".iconStar"));
                                var qs = parent.querySelector(groupText == "Star"
                                                                ? ".iconStar"
                                                                : ".indicatorGroup[title=\"" + groupText + "\"]");
                                if(null != qs) {
                                    qs.remove();
                                }
                            }
                        } else if(this.status >= 400 && this.status < 600 ){
                            console.log(theirGuid + " unsuccessfully starred :( " + xmlhttp.status);
                        }
                    };

                    xmlhttp.send(payload);
                    var start = Date.now();
                    do{
                        console.debug(theirGuid + " sleeping, state:" + xmlhttp.readyState);
                        await sleep(writeSleep);
                    }while(xmlhttp.readyState != 4 && ((Date.now() - start) < 180000));
                    console.debug(theirGuid + " attempt " + attempt++ + ") status: " + xmlhttp.status + ", rs: " + xmlhttp.readyState);
                }while(xmlhttp.status != 200);
            }
        }
    }

    async function getRawDNA(url, myGuid, theirGuid){
        url = window.location.origin + "/discoveryui-geneticfamilyservice/api/probability/" + myGuid + "/to/" + theirGuid + "/modal";
        var backoff = 100;
        do {
       //     console.log("val:" + localStorage.getWithExpiry("asm:" + url));
            //If the raw DNA figure is not in cache, grab and and shove it in
            if(null == localStorage.getWithExpiry("ard:" + url)){
                await sleep(backoff);

                var xmlhttp = new XMLHttpRequest();
                xmlhttp.onreadystatechange = function() {
                    if (this.readyState == 4 && this.status == 200) {
                        var res = JSON.parse(this.responseText);
                        processRawDNA(url, res);
                    }
                };
                xmlhttp.open("GET", url, true);
                xmlhttp.send();
            }

            if(null != localStorage.getWithExpiry("ard:" + url)){
                return;
            }
            backoff = backoff + Math.floor(Math.random() * backoff);
        } while(!localStorage.getWithExpiry("ard:" + url));
    }

    async function getMatches(url){
        var backoff = 100;
        do {
     //       console.log("val:" + localStorage.getWithExpiry("asm:" + url));
            //If the shared match count is not in cache, grab and and shove it in
            if(null == localStorage.getWithExpiry("asm:" + url)){
                await sleep(backoff);

                var xmlhttp = new XMLHttpRequest();
                xmlhttp.onreadystatechange = function() {
                    if (this.readyState == 4 && this.status == 200) {
                        var myArr = JSON.parse(this.responseText);
                        processSharedMatches(url, myArr);
                    }
                };
                xmlhttp.open("GET", url, true);
                xmlhttp.send();
            }

            if(null != localStorage.getWithExpiry("asm:" + url)){
                return;
            }
            backoff = backoff + Math.floor(Math.random() * backoff);
        } while(!localStorage.getWithExpiry("asm:" + url));
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function debounce(fun, mil){
        var timer;
        return function(){
            clearTimeout(timer);
            timer = setTimeout(function(){
                fun();
            }, mil);
        };
    }

    function getMyGuid(url){
        var rx = /compare\/(.*)\/with/;
        var res = rx.exec(url);
        return res[1];
    }

    function getTheirGuid(url){
        var rx = /with\/(.*)\/?/;
        var res = rx.exec(url);
        return res[1];
    }

    // Store zero matches with a TTL of a week to two weeks, and ones with values for 30 days to 60 days, to minimise the load, but have the
    // highest chance of spotting new shared matches
    function processSharedMatches(url, matchData){
        localStorage.setWithExpiry("asm:" + url, matchData.matchCount, matchData.matchCount == 0
                                   ? (zeroSMatchesCacheExpiry + zeroSMatchesCacheExpiry * Math.random())
                                   : (hasSMatchesCacheExpiry + hasSMatchesCacheExpiry * Math.random()));
    }

    function processRawDNA(url, dnaPayload){
        const dnaData = { tDNA: dnaPayload.html.body.match("Shared DNA: <strong>(.*?) cM</strong> across <strong>.*? segments</strong>")[1], segments: dnaPayload.html.body.match("Shared DNA: <strong>.*? cM</strong> across <strong>(.*?) segments</strong>")[1], dna: dnaPayload.html.body.match("Unweighted shared DNA: <strong>(.*?) cM</strong>")[1], longestSegment: dnaPayload.html.body.match("Longest segment: <strong>(.*?) cM</strong>")[1] };
        localStorage.setWithExpiry("ard:" + url, dnaData, zeroSMatchesCacheExpiry + zeroSMatchesCacheExpiry * Math.random());
    }

// Localstorage with expiry taken from https://www.sohamkamani.com/blog/javascript-localstorage-with-ttl-expiry/
    function setWithExpiry(key, value, ttl) {
        const now = new Date();

        // `item` is an object which contains the original value
        // as well as the time when it's supposed to expire
        const item = {
            value: value,
            expiry: now.getTime() + ttl,
        }
        localStorage.setItem(key, JSON.stringify(item));
    }
    Storage.prototype.setWithExpiry = setWithExpiry;

    function getWithExpiry(key) {
        const itemStr = localStorage.getItem(key);
        // if the item doesn't exist, return null
        if (!itemStr) {
            return null;
        }
        const item = JSON.parse(itemStr);
        const now = new Date();
        // compare the expiry time of the item with the current time
        if (now.getTime() > item.expiry) {
            // If the item is expired, delete the item from storage
            // and return null
            localStorage.removeItem(key);
            return null;
        }
        return item.value;
    }
    Storage.prototype.getWithExpiry = getWithExpiry;

    // Delete all localStorage items with a set expiry date
    function clearExpired(i = 0) {
        var eachitem;
        var eachkey;
        var dummyitem;

        // Loop all localStorage items that has an expiry date
        if( i < localStorage.length){
            eachitem = localStorage.getItem(localStorage.key(i));
            eachkey = localStorage.key(i);
            // If value includes "expiry", call GetWithExpiry to read it and delete if expired
            if (eachitem.includes("expiry")) {
                // Call function to read it and delete if expired
                dummyitem = localStorage.getWithExpiry(eachkey);
            }
            i++;
            setTimeout(function(){ clearExpired(i); }, 100);
        }
    }
    Storage.prototype.clearExpired = clearExpired;

// Main body
    localStorage.clearExpired();

    // Prepare the table
    if(!document.getElementById("matchCssOverrides")){
        var styles = `
.treeInformation .iconLeafEntry
{
    margin-bottom: initial !important
}

.iconPeople::before {
	content: "\\E64A";
	font-weight: bold;
}

.iconSmatch::before {
	content: "\\2229";
	font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
	font-size: x-large;
	font-weight: bold;
}

.discoveryui-matches-app.panelOpen:not(.sidebarPush) .matchListColumnWrap:not(.panelOpen) .updatedLayout .matchGrid, .discoveryui-matches-app:not(.panelOpen) .updatedLayout .matchGrid
{
	grid-column-gap: 5px !important;
}

.discoveryui-matches-app.panelOpen:not(.sidebarPush) .matchListColumnWrap:not(.panelOpen) .matchGrid,
.discoveryui-matches-app:not(.panelOpen) .matchGrid
{
    grid-template-columns: 6fr 5fr 4fr 5fr 1fr !important;
}

.smatchRangeWrapper
{
	border-bottom: 1px solid rgba(0,0,0,.1);
	margin: -10px -10px 5px;
}

.smatchRangePanel
{
    margin-top: 12px;
    width: 15em;
}

.smatchRangePanel .displayTable {
	display: grid;
	grid-template-columns: 1fr 15px 1fr;
	justify-content: space-between;
	align-items: center;
}

#filter_nottags_options .calloutPointer{
    left: calc(20% - 16px)
}

.updatedLayout .matchGrid .notVisible {
	height: initial !important;
	line-height: initial !important;
	border: initial !important;
	visibility: initial !important;
}
`;

        var styleSheet = document.createElement("style")
        styleSheet.id = "matchCssOverrides";
        styleSheet.type = "text/css";
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);
    }

    // Add the filter options
    var newFilter = document.createElement("span");

    var newFilterButton = document.createElement("button");
    newFilterButton.type="button";
    newFilterButton.className = "ancBtn ancBtnRnd filter iconAfter outline ng-star-inserted iconArrowDownAfter";
    newFilterButton.id = "filter_sharedmatches";
    newFilterButton.innerText = "Shared Matches";

    function toggleSMatchCallout(){
        var filterElement = document.getElementById("filter_sharedmatches");
        var optionsElement = document.getElementById("filter_sharedmatches_options");
        optionsElement.style.display = optionsElement.style.display == "none" ? "block" : "none";
        filterElement.classList.toggle("selected");
        filterElement.classList.toggle("iconArrowUpAfter");
        filterElement.classList.toggle("iconArrowDownAfter");
    }

    newFilterButton.onclick = debounce(toggleSMatchCallout, 250);
    newFilter.appendChild(newFilterButton);

    window.resetSMatch = function(){
        window.removesmatches = false;
        var matches = document.querySelectorAll("match-list match-entry-updated");
        matches.forEach(function(i){if(i.style.display == "none") { i.style.display = "block"; } });
    }

    window.filterSMatches = function(){
console.log("filtering");
        window.removesmatches = true;
        window.smatchmin = parseInt(document.getElementById("smatchmin").value, 10);
        window.smatchmax = parseInt(document.getElementById("smatchmax").value, 10);
        var matches = document.querySelectorAll("match-list match-entry-updated");
        matches.forEach(function(i){processMatch(i, filterSMatches, always, null)});
        toggleSMatchCallout();
        fixup();
    }

    var newFilterOptions = document.createElement("div");
    newFilterOptions.id = "filter_sharedmatches_options";
    newFilterOptions.style.position = "absolute";
    newFilterOptions.style.display = "none";
    newFilterOptions.className = "calloutContent";
    newFilterOptions.innerHTML = `
    <div class="smatchRangeWrapper ng-star-inserted">
        <filters-cm-range>
            <div class="smatchRangePanel">
                <div class="ancGrid ancGridPadded">
                    <div class="ancCol ancColRow w100">
                        <div class="displayTable">
                            <input type="text" id="smatchmin" name="smatchmin" placeholder="Enter min" title="Enter min" class="ng-untouched ng-pristine ng-valid" value="1">
                            <div class="dash" style="text-align:center">–</div>
                            <input type="text" id="smatchmax" name="smatchmax" placeholder="Enter max" title="Enter max" class="ng-untouched ng-pristine ng-valid">
                        </div>
                    </div>
               </div>
            </div>
        </filters-cm-range>
    </div>
    <div class="controls ng-star-inserted" style="">
        <button id="resetSMatch" type="button" class="link resetFilters" style="float:left;position:relative;margin:0.5em 0em;top:0.5em;" onclick="resetSMatch()">Reset</button>
        <input id="applySMatch" type="submit" class="ancBtn" value="Apply" style="float:right;position:relative;margin:0.5em 0em;top:0.25em;" onclick="filterSMatches()">
    </div>
`;

    newFilter.appendChild(newFilterOptions);

    // Add the filter options
    var newTagFilter = document.createElement("span");

    var newTagFilterButton = document.createElement("button");
    newTagFilterButton.type="button";
    newTagFilterButton.className = "ancBtn ancBtnRnd filter iconAfter outline ng-star-inserted iconArrowDownAfter";
    newTagFilterButton.id = "filter_nottags";
    newTagFilterButton.innerText = "Not Groups";

    function toggleNotTagsCallout(){
        var filterElement = document.getElementById("filter_nottags");
        var optionsElement = document.getElementById("filter_nottags_options");
        optionsElement.style.display = optionsElement.style.display == "none" ? "block" : "none";
        filterElement.classList.toggle("selected");
        filterElement.classList.toggle("iconArrowUpAfter");
        filterElement.classList.toggle("iconArrowDownAfter");
    }

    newTagFilterButton.onclick = debounce(toggleNotTagsCallout, 250);
    newTagFilter.appendChild(newTagFilterButton);

    window.resetNotTags = function(){
        window.hideTags = null;
        var matches = document.querySelectorAll("match-list match-entry-updated");
        matches.forEach(function(i){if(i.style.display == "none") { i.style.display = "block"; } });
    }

    window.filterNotTags = function(){
console.log("filtering");
        window.hideTags = Object.entries(document.querySelectorAll("#filter_nottags_options .calloutMenuChecked")).map(function(i){return i[1].id.replace("tagNotFilterGroup","")});
        //window.smatchmin = parseInt(document.getElementById("smatchmin").value, 10);
        //window.smatchmax = parseInt(document.getElementById("smatchmax").value, 10);
        var matches = document.querySelectorAll("match-list match-entry-updated");
        matches.forEach(function(i){processMatch(i, filterTags, always, null)});
        toggleNotTagsCallout();
    }

    var newTagFilterOptions = document.createElement("div");
    newTagFilterOptions.id = "filter_nottags_options";
    newTagFilterOptions.style="position: absolute; display: none; width: 300px";
    newTagFilterOptions.innerHTML = `
<div tabindex="-1" class="calloutContent" style="max-height:750px;position:absolute;width:100%;top:10px;left:-30%;">
    <ul class="calloutMenu" style="max-height:600px;overflow-y:scroll">
        <li><button onclick="handleNotTagsFilter(this)" id="tagNotFilterGroupStar" groupText="Star" groupId="-1" type="button" class="tagGroup bold iconAfter link"><span class="icon iconStar"></span> Star <div class="textxsml normal sand4" style="padding-left:24px">Filter out starred matches</div></button></li>
    </ul>
    <!---->
    <!---->
    <div class="controls" style="">
        <button id="resetNotTags" type="button" class="link resetFilters" style="float:left;position:relative;margin:0.5em 0em;top:0.5em;" onclick="resetNotTags()">Reset</button>
        <input id="applyNotTags" type="submit" class="ancBtn" value="Apply" style="float:right;position:relative;margin:0.5em 0em;top:0.25em;" onclick="filterNotTags()">
    </div>
</div>
<div class="calloutPointer willTransform style=" transform:="" translate(0px);"="">
<div class="calloutPointerShadow">
</div>
</div>
`;
    newTagFilter.appendChild(newTagFilterOptions);

    // Add in the groups
    await getGroups();

    Object.entries(window.tagGroups).map(function(i){return i[1]}).sort(function(a,b){return a.label < b.label;}).forEach(function(i){
        var groupButtonItem = document.createElement("li");
        var groupButton = document.createElement("button");
        groupButton.id = "tagNotFilterGroup" + i.tagId;
        groupButton.groupId = i.tagId;
        groupButton.groupText = i.label;
        groupButton.type = "button";
        groupButton.className = "tagGroup calloutMenuUnchecked iconAfter link";
        groupButton.onclick=function(){handleNotTagsFilter(groupButton)};

        var indicatorGroup = document.createElement("span");
        indicatorGroup.className = "indicatorGroup";
        indicatorGroup.style.backgroundColor = i.color;
        groupButton.appendChild(indicatorGroup);

        var text = document.createTextNode(i.label);
        groupButton.appendChild(text);

        var groupButtonText = document.createElement("div");
        groupButtonText.className = "textxsml normal sand4";
        groupButtonText.style.paddingLeft = "24px";
        groupButtonText.innerText = "Filter out matches in this group";
        groupButton.appendChild(groupButtonText);
        groupButtonItem.appendChild(groupButton);

        newTagFilterOptions.querySelector(".calloutMenu").appendChild(groupButtonItem);
    });

    window.handleNotTagsFilter = function(e){
        var matches = document.querySelectorAll("#filter_nottags_options .tagGroup");
        e.classList.toggle("calloutMenuUnchecked");
        e.classList.toggle("calloutMenuChecked");
        e.classList.toggle("iconAfterCheck");
    }

    const actionsStart = Date.now();
    var actionsParent;
    do {
        actionsParent = document.querySelector(".sortAndSearchGroup");
        if(!actionsParent){
            console.log("Looking for filters...");
            await sleep(500);
        }
    } while(!actionsParent && Date.now() - actionsStart < 10000);
    console.log("Actions!");
    if(Date.now() - actionsStart >= 10000) {
        window.location.search = window.location.search.concat(window.autoscroll ? "&autoscroll=true" : "");
    }

    var bulkMatchesInterval;

    var bulkMatches = document.createElement("bulkmatches");
    bulkMatches.style="position: relative;";

    window.doBulkOperation = async function(element){
        if(!element.classList.contains("disabled")) {
            var mode = document.getElementById("bulkMatchesCallout").querySelector(".bulkMode.calloutMenuChecked").id.replace("bulkMode", "").toLowerCase();
            var matches = document.querySelectorAll("match-list match-entry-updated");
            var group = document.getElementById("bulkMatchesCallout").querySelector(".bulkGroup.calloutMenuChecked");
            for(const i of matches){
                processMatch(i, tagCore, always, mode, group.groupText ?? group.getAttribute("groupText"), group.groupId ?? group.getAttribute("groupId"));
            };
            document.getElementById('bulkMatchesCallout').classList.toggle("open");
        }
    };

    var doBulkMatches = document.createElement("button");
    doBulkMatches.id = "bulkMatches";
    doBulkMatches.type = "button";
    doBulkMatches.className = "link";
    doBulkMatches.innerText = "Bulk Matches";
    doBulkMatches.onclick = function(){document.getElementById('bulkMatchesCallout').classList.toggle("open");};
    bulkMatches.appendChild(doBulkMatches);

    window.handleBulkMode = function(e){
        var grouping = e.id.startsWith("bulkMode") ? "Mode" : "Group";
        console.debug(e.id);
        var matches = document.querySelectorAll("#bulkMatchesCallout .bulk" + grouping);
        var wasSet = e.classList.contains("calloutMenuChecked");
        matches.forEach(async function(i){
            i.classList.remove("calloutMenuChecked");
            i.classList.remove("iconAfterCheck");
            i.classList.add("calloutMenuUnchecked");
        });
        if(!wasSet){
           e.classList.remove("calloutMenuUnchecked");
           e.classList.add("calloutMenuChecked");
           e.classList.add("iconAfterCheck");
        }
    }

    var bulkMatchesCallout = document.createElement("div");
    bulkMatchesCallout.id="bulkMatchesCallout";
    bulkMatchesCallout.className="callout calloutPositionBottom ngCallout sortCallout willTransform";
    bulkMatchesCallout.style="opacity: 1;position: absolute;left: -100%;top: 1.5em;width:360%;";
    bulkMatchesCallout.innerHTML = `
<div tabindex="-1" class="calloutContent" style="max-height:750px;position:absolute;width:100%">
    <ul class="calloutMenu" style="max-height:600px;overflow-y:scroll">
        <li><button onclick="handleBulkMode(this)" id="bulkModeSet" type="button" class="bulkMode bold iconAfter link"> Set Mode <div class="textxsml normal sand4">Set chosen flag/group on visible matches</div></button></li>
        <li><button onclick="handleBulkMode(this)" id="bulkModeClear" type="button" class="bulkMode bold iconAfter link"> Clear Mode <div class="textxsml normal sand4">Clear chosen flag/group from visible matches</div></button></li>
        <li><button onclick="handleBulkMode(this)" id="bulkModeToggle" type="button" class="bulkMode bold iconAfter link"> Toggle Mode <div class="textxsml normal sand4">Toggle chosen flag/group on visible matches</div></button></li>
        <li><button onclick="handleBulkMode(this)" id="bulkGroupStar" groupText="Star" groupId="-1" type="button" class="bulkGroup bold iconAfter link"><span class="icon iconStar"></span> Star <div class="textxsml normal sand4" style="padding-left:24px">Flag using stars</div></button></li>
    </ul>
    <!---->
    <!---->
    <div class="controls" style="">
        <button id="resetBulk" type="button" class="link" style="float:left;position:relative;margin:0.5em 0em;top:0.5em;" onclick="document.getElementById('bulkMatchesCallout').classList.toggle('open');">Cancel</button>
        <input id="applyBulk" type="submit" class="ancBtn disabled" style="float:right;position:relative;margin:0.5em 0em;top:0.25em;" value="Do it!" onclick="doBulkOperation(this)">
    </div>
</div>
<div class="calloutPointer willTransform style=" transform:="" translate(0px);"="">
<div class="calloutPointerShadow">
</div>
</div>
`;
    bulkMatches.appendChild(bulkMatchesCallout);

    // Add in the groups
    await getGroups();

    Object.entries(window.tagGroups).map(function(i){return i[1]}).sort(function(a,b){return a.label < b.label;}).forEach(function(i){
        var groupButtonItem = document.createElement("li");
        var groupButton = document.createElement("button");
        groupButton.id = "bulkGroup" + i.tagId;
        groupButton.groupId = i.tagId;
        groupButton.groupText = i.label;
        groupButton.type = "button";
        groupButton.className = "bulkGroup calloutMenuUnchecked iconAfter link";
        groupButton.onclick=debounce(function(){handleBulkMode(groupButton)}, 250);

        var indicatorGroup = document.createElement("span");
        indicatorGroup.className = "indicatorGroup";
        indicatorGroup.style.backgroundColor = i.color;
        groupButton.appendChild(indicatorGroup);

        var text = document.createTextNode(i.label);
        groupButton.appendChild(text);

        var groupButtonText = document.createElement("div");
        groupButtonText.className = "textxsml normal sand4";
        groupButtonText.style.paddingLeft = "24px";
        groupButtonText.innerText = "Flag using this group";
        groupButton.appendChild(groupButtonText);
        groupButtonItem.appendChild(groupButton);

        bulkMatchesCallout.querySelector(".calloutMenu").appendChild(groupButtonItem);
    });

    var bulkObserver = new MutationObserver(async function(mutations) {
        mutations.forEach(async function(mutation) {
            bulkObserver.disconnect();
            var hasMode = bulkMatches.querySelectorAll(".bulkMode.calloutMenuChecked").length > 0;
            var hasGroup = bulkMatches.querySelectorAll(".bulkGroup.calloutMenuChecked").length > 0;
            console.debug(hasMode + ":" + hasGroup);
            if(hasMode && hasGroup){
                bulkMatches.querySelector("#applyBulk").classList.remove("disabled");
            } else {
                bulkMatches.querySelector("#applyBulk").classList.add("disabled");
            }
            bulkObserver.observe(bulkMatches, { attributes: true, subtree: true });
        });
    });
    bulkObserver.observe(bulkMatches, { attributes: true, subtree: true });

    actionsParent.insertBefore(bulkMatches, actionsParent.querySelector("*"));

    var div = document.createElement("span");
    div.className = "divider";
    div.innerText = "|";
    actionsParent.insertBefore(div, bulkMatches.nextSibling);

    var autoScrollInterval;

    var autoScroll = document.createElement("autoscroll");
    var doAutoScroll = document.createElement("button");
    doAutoScroll.id = "autoScroll";
    doAutoScroll.type = "button";
    doAutoScroll.className = "link";
    doAutoScroll.innerText = "AutoScroll";
    doAutoScroll.onclick = debounce(handleAutoScroll, 250);

    autoScroll.appendChild(doAutoScroll);
    actionsParent.insertBefore(autoScroll, div.nextSibling);

    const addStyle = (() => {
        const style = document.createElement('style');
        document.head.append(style);
        return (styleString) => style.textContent = styleString;
    })();

    function handleAutoScroll(){
        if(autoScrollInterval) {
            console.log("clearing autoScroll");
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
            document.querySelector("autoscroll").classList.remove("running");
            window.autoscroll = false;
        } else {
            console.log("starting autoScroll");
            autoScrollInterval = setInterval(function(){
                if( null == document.evaluate("//match-entry-updated//*[contains(., '% shared DNA')]", document, null, XPathResult.ANY_TYPE, null ).iterateNext()) {
                    window.scrollTo(0,0);
                    window.scrollTo(0,999999999);
                }
            }, autoScrollIntervalMilliseconds);
            document.querySelector("autoscroll").classList.add("running");
            window.autoscroll = true;
        }
    };

    addStyle(`
@keyframes marching-ants-1 {
  0% {
}
  100% {
    background-position: 40px 0, -40px 100%, 0 -40px, 100% 40px;
  }
}

autoscroll.running {
  background-size: 20px 2px, 20px 2px, 2px 20px, 2px 20px;
  padding: 1px 4px;
  background-position: 0 0, 0 100%, 0 0, 100% 0;
  background-repeat: repeat-x, repeat-x, repeat-y, repeat-y;
  animation: marching-ants-1 2s;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  background-image: linear-gradient(to right, #0079a3 50%, #fff 50%), linear-gradient(to right, #0079a3 50%, #fff 50%), linear-gradient(to bottom, #0079a3 50%, #fff 50%), linear-gradient(to bottom, #0079a3 50%, #fff 50%);
  animation-play-state: running;
}`);

    var div2 = document.createElement("span");
    div2.className = "divider";
    div2.innerText = "|";
    actionsParent.insertBefore(div2, autoScroll.nextSibling);

    const filterStart = Date.now();
    var filters;
    do {
        filters = document.querySelector(".filtersContainer .filters");
        if(!filters){
            console.debug("No filters. Waiting...");
            await sleep(500);
        }
    }while(!filters && Date.now() - filterStart < 10000);
    if(Date.now() - filterStart >= 10000) {
        window.location.search = window.location.search.concat(window.autoscroll ? "&autoscroll=true" : "");
    }

    console.debug("Filters!");

    if(window.autoscroll) {
        handleAutoScroll();
    }

    var resetFilters = document.querySelector(".filtersContainer .filters a");
    filters.insertBefore(newTagFilter, resetFilters);
    filters.insertBefore(newFilter, resetFilters);

    // select the target node
    var target;
    do{
        console.debug("Grabbing list");
        target = document.querySelector('match-list');
        if(target) {
            continue;
        }
        await sleep(1000);
    }while(!target);
    console.debug("Got list");

    // create an observer instance
    var observer = new MutationObserver(async function(mutations) {
        mutations.forEach(async function(mutation) {
            if(mutation.target.nodeName == "MATCH-ENTRY-UPDATED"){
               // console.debug(mutation.type + ":" + mutation.target.innerText);
                await processMatch(mutation.target, removeStupidButton)
                    .then(processMatch(mutation.target, showAllGroups))
                  //  .then(processMatch(mutation.target, filterSMatches));
                    .then(processMatch(mutation.target, visual))
                    .then(processMatch(mutation.target, filterTags));
                //    .then(processMatch(mutation.target, star));
            }
        });
    });

    // Every 6 minutes, check we don't have any missing rows for whatever reason
    setTimeout(fixup, initalFixupTimeout);
    setInterval(fixup, fixupTimeout);

    // pass in the target node, as well as the observer options
    observer.observe(target, { childList: true, subtree: true });

    var appRoot = document.querySelector("app-root");
    var toolsObserver = new MutationObserver(async function(mutations) {
        mutations.forEach(async function(mutation) {
            toolsObserver.disconnect();
            //console.log(mutation.target.id + mutation.type + ":" + mutation.target.innerText);
            if(mutation.target.id == "showTools"){
                console.log("add here");
                //debugger;
            }
            toolsObserver.observe(appRoot, { attributes: true, subtree: true });
        });
    });

    toolsObserver.observe(appRoot, { childList:true, attributes: true, subtree: true });
})();
