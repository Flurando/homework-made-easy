# homework-made-easy

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

want to write homework anywhere, as long as you got a browser and internet connection?

If you are willing to write in markdown (for texts) and latex (for math formulas), this is for you!

# Functionalities

## Offline compatibility

After the initial loading, or you somehow ask your browser to cache longer, there is no need of internet connections anymore unless you want to sync your work with other devices!

## Automatic caching

A special functionality of browsers called indexDB is abused here.

Every 2 seconds of inactivity (no screen touching nor keystrokes), your current work would be
saved in the indexDB.

So you can safely close your browser and pick up as long as you are not in private mode or mannually clear all the data stored under the domain.

## Realtime rendering

The markdown content is rendered in real time, with math equations as well.

But due to the poor design of re-render the whole content every input, you might face huge lags if you have a really long markdown content.

In that case I suggest you to divide your homework in parts, or submit a patch for lazy rendering, which I don't really know how to implement.

## PDF exporting

Most assignments from academies in world, as I know, do not accept pure markdown as submittion format.

So here you can press [Download] button to get an exact PDF as the preview part.

Currently using html2pdf.js with default options, get in touch with me if you have ideas to make it better.

## Data sync-ing

Not implemented yet, but I put it here because this must be done before this project could be considerred usable by me myself.

Anyway, my initial point of starting this fork is doing homework everywhere, not being able to sync across browsers or devices would make this meaningless.

Actually I planned to go serverless p2p with webrtc tech originally, but that would require my iphone to have yggdrasil network or equivalences joined or my laptop behind several CGNATs to get a public ipv4 or ipv6 address, both being impossible these days.

So I fall back to the legacy server&client mode, acceptable as this is just a project for stupid schoolworks, with my attention drawn towards the excellent PouchDB and CouchDB.

# Drawbacks

1. no encryption except the "s" in "https".
   
   yes, all the storages, are in plain text! Including the coming remote server sync-ing functionality.
   
   but don't get upset now, even though I really don't understand why a Chinese giving out name, ID card numbers, phone numbers, birthday, and so on easily would one day wish to hide their homework content, I would write a tutorial that handle this -- covering how to host the server in your home, with any old unused computer, tablets, or jailbreaked old iphones.
2. require special care when interacting with PouchDB or CouchDB
   
   four buttons are planned in the control bar, save, open, push, pull.
   
   this is different from autosaving cache, 
   1. when you save, current filename in infobar and current markdown content is saved to local PouchDB.
   2. when you open, prompted filename along with corresponding cache in local PouchDB covers current filename in infobar and the markdown content, unsaved works? Lost forever!
   3. when you push, local PouchDB is pushed to remote CouchDB.
   4. when you pull, local PouchDB is pulled from remote CouchDB.
3. only basic functionalities coming to database
   
   guess what, in fact, PouchDB and CouchDB store all the history files even when you tell it to delete! So actually, as long as you don't clear the indexDB, nothing saved would ever be lost! However, relevant functionality is not implemented here, do it if you have time and effort.
# License

This project is under the **AGPL-v3 License**. See the [LICENSE](LICENSE) file for full details. You are free to use, modify, and distribute this software under specified terms.

There is also an [LICENSE.old](LICENSE.old) file which is the **MIT License**, that is **no longer** the case for this fork, just kept here because **MIT License** requires so.
