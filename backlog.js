function Backlog (aconf) {
  var acount = 0,    // async counter
      conf = new Object,
      oldest,        // oldest, epoch ms
      revs,          // backlog, oRevs objects array
      sliced = false // revs sliced before saving

  this.getNewer = getNewer
  this.getOlder = getOlder
  this.search = search

  init()


  function flush (val) {
    var brevs = revs.slice(0), // search deletes items
        cont = "<strong>nothing to show this time…</strong>",
        regex, rev

    if (val.length) {
      regex = new RegExp(val.split(" ").join("|"), "i")
      brevs.forEach(searchRevs, regex)
    }

    if (Object.keys(brevs).length) { // search returns array with empty spots
      cont = "\n"
      brevs.reverse()

      for (var i = 0; i < brevs.length; i++) {
        if (!brevs[i])
          continue // search returns array with empty spots

        rev = brevs[i]
        cont += "<tr><td>"

        for (var j = 0; j < rev.fls.length; j++)
          cont += conf.difflink.replace(/#type/, rev.repo.type)
                               .replace(/#domain/, rev.repo.domain)
                               .replace(/#reva/, rev.diff)
                               .replace(/#revb/, rev.node)
                               .replace(/#path/g, rev.repo.path)
                               .replace(/#file/g, rev.fls[j])

        cont += "</td><td>"
        cont += rev.desc.replace(conf.rbug, conf.buglink)
        cont += "\n\n<span>" + new Date(rev.time * 1000).toLocaleString() + "</span><span>" + rev.author + "</span>"
        cont += "</td></tr>\n"
      }
    }

    document.getElementsByTagName("table")[0].innerHTML = cont

    if (document.getElementById("getOlder").hidden) {
      document.getElementById("getOlder").hidden = false
      document.getElementsByTagName("form")[0].hidden = false
      document.getElementById("status").hidden = true
    }

    document.getElementById("getOlder").textContent = "get older"
  }

  function get (repo) {
    this.mozhg = getMozhg
    this[repo.type](repo, this.n)
  }

  function getMozhg (repo, getnew) {
    var n, p, r = new XMLHttpRequest

    if (getnew) {
      n = getNewest(repo)
      p = n ? "fromchange=" + n :
              "startdate=" + urlDateStr(oldest)
    } else {
      p = "startdate=" + urlDateStr(oldest - conf.once) + "&enddate=" + urlDateStr(oldest + 1000)
    }

    r.open("GET", "http://" + repo.domain + "/" + repo.path + "/json-pushes?full=1&" + p, true)
    r.onreadystatechange = function () {
      if (r.readyState == 4) {
        if (r.status == 200) {
          process(JSON.parse(r.responseText), repo, getnew)
        } else {
          mes = "<span style=\"color: #bd0202; font-weight: bold\">" +
                "There was an error while trying to load resources. Try reloading the page.</span>"
          getnew ? document.getElementById("status").innerHTML = mes :
                   document.getElementById("getOlder").innerHTML = mes
        }
      }
    }
    r.send(null)
  }

  function getNewer () {
    conf.reps.forEach(get, { n: true })
  }

  function getNewest (repo) {
    for (var i = revs.length - 1; i >= 0; i--)
      if (revs[i].repo.path == repo.path &&
          revs[i].repo.domain == repo.domain &&
          revs[i].repo.type == repo.type)
        return revs[i].node

    return false
  }

  function getOlder (evt) {
    var elm = document.getElementById("getOlder")

    if (window.pageYOffset < (document.body.scrollHeight - 4 * window.innerHeight))
      return

    if (evt.type == "click")
      evt.preventDefault() // get older is a link…

    if (!elm.firstElementChild) {
      elm.innerHTML = "<progress title=\"loading more data\">loading more data…</progress>"
      conf.reps.forEach(get, { n: false })
    }
  }

  function init () {
    conf.key = aconf.key || false // localStorage key or false to disable saving
    conf.cache = aconf.cache || (Date.now() - 7 * 7 * 24 * 60 * 60 * 1000) / 1000 // epoch (s!) date to cache items up to or 0 to cache all
    conf.once = aconf.once || 6 * 7 * 24 * 60 * 60 * 1000 // get entries time range in ms
    conf.reps = aconf.reps                         // array of repository objects
    conf.rbug = aconf.rbug || /(\d{3,6})/g         // bug regexp to filter on
    conf.rpath = aconf.rpath || new oRegExpSub     // path regexp to filter on
    conf.rauthor = aconf.rauthor || new oRegExpSub // author regexp to filter on
    conf.rbranch = aconf.rbranch || new oRegExpSub // branch regexp to filter on
    conf.buglink = aconf.buglink || "$&"           // bug link template
    conf.difflink = aconf.difflink || "$&\n"       // diff link template, new line is important

    loadBacklog()
  }

  function loadBacklog () {
    if (conf.key &&
        typeof(localStorage) === "object" && // != undefined?
        typeof(localStorage.getItem) === "function") {
      var aStr = localStorage.getItem(conf.key)
      if (aStr) {
        revs = JSON.parse(aStr)
        if (revs.length)
          oldest = revs[0].time * 1000
      }
    }

    if (!revs) revs = new Array
    if (!oldest) oldest = Date.now() - conf.once
  }

  function oRegExpSub () {
    this.test = function () { return true }
  }

  /*
  function oRepo (domain, path, type) {
    this.domain = domain // url = [protocol + "://" +] domain + "/" + path + "/"
    this.path = path
    this.type = type     // mozhg, svn
  }
  */

  function oRev (author, desc, node, repo, dateInSeconds, files) {
    this.author = sanitize(author)
    this.desc = sanitize(desc)
    this.diff = 0    // old node for diff, correct one will be set in process function
    this.node = node // whatever (string, number) identifying revision
    this.repo = repo
    this.time = dateInSeconds
    this.fls = files
  }

  function process (obj, repo, getnew) {
    this.mozhg = processMozhg
    this[repo.type](obj, repo, getnew)

    acount++
    if (acount % conf.reps.length == 0) {
      revs.sort(function (x, y) { return x.time - y.time })

      for (var r = 0; r < revs.length; r++)
        if (!revs[r].diff && r != 0)
          for (var i = r - 1; i > 0; i--)
            if (revs[r].repo.path == revs[i].repo.path &&
                revs[r].repo.type == revs[i].repo.type &&
                revs[r].repo.domain == revs[i].repo.domain) {
              revs[r].diff = revs[i].node
              break
            }

      flush(document.getElementsByTagName("input")[0].value)

      if (!getnew) oldest -= conf.once

      if (!sliced && // don't save cache if it was sliced last time
          conf.key &&
          typeof(localStorage) === "object" && // != undefined?
          typeof(localStorage.setItem) === "function") {
        var brevs = JSON.parse(JSON.stringify(revs)) // make copy of backlog, cut it if needed and save to cache

        if (conf.cache)
          for (var i in brevs)
            if (brevs[i].time > conf.cache) {
              brevs = brevs.slice(i);
              sliced = true
              break
            }

        localStorage.setItem(conf.key, JSON.stringify(brevs))
      }
    }
  }

  function processMozhg (obj, repo) {
    for (var push in obj)
      for (var i = 0; i < obj[push].changesets.length; i++)
        processMozhgRev(obj[push].changesets[i], obj[push].date, repo)
  }

  function processMozhgRev (chg, date, repo) {
    if (conf.rbranch.test(chg.branch)) {
      var fls = new Array

      for (var i = 0; i < chg.files.length; i++)
        if (conf.rpath.test(chg.files[i]) && conf.rauthor.test(chg.author))
          fls.push(chg.files[i])

      if (fls.length)
        revs.push(new oRev(chg.author, chg.desc, chg.node.substring(0, 12), repo, date, fls))
    }
  }

  function sanitize (aStr) {
    return aStr.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  }

  function search (evt) {
    flush(document.getElementsByTagName("input")[0].value)
    evt.preventDefault() // for submit event
  }

  function searchRevs (rev, index, array) {
    if (this.test(rev.repo.path + "/" + rev.fls.join(" " + rev.repo.path + "/"))) return
    if (this.test(rev.author)) return
    if (this.test(rev.desc)) return
    if (this.test(rev.node)) return

    delete array[index]
  }

  function urlDateStr (ms) {
    var d = new Date(ms).toISOString()
    return d.substring(0, 10) + "%20" + d.substring(11, 19)
  }
}
