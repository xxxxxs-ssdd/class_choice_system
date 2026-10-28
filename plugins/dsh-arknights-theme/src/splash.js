/*
 * Boot animation driver. Served as an inline classic script, so it must stay
 * ES5-flavoured and must never contain a closing script tag.
 */
(function () {
  var boot = document.getElementById('ak-boot')
  if (!boot) return

  var bar = document.getElementById('ak-boot-bar')
  var pct = document.getElementById('ak-boot-pct')
  var log = document.getElementById('ak-boot-log')

  var reduce = false
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch (error) {
    reduce = false
  }

  var LOGS = [
    [0, '正在校验终端凭证 …'],
    [620, '正在连接教务数据通道 …'],
    [1240, '正在载入培养方案知识库 …'],
    [1880, '链路就绪 · 欢迎回来']
  ]

  var timers = []
  var frame = 0
  var finished = false

  function clearTimers() {
    for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i])
    timers.length = 0
    if (frame) window.cancelAnimationFrame(frame)
    frame = 0
  }

  function setProgress(value) {
    var next = Math.max(0, Math.min(100, value))
    if (bar) bar.style.width = next + '%'
    if (pct) pct.textContent = (next < 10 ? '0' : '') + Math.round(next) + '%'
  }

  function finish() {
    if (finished) return
    finished = true
    clearTimers()
    boot.classList.add('ak-boot--out')
    timers.push(window.setTimeout(function () {
      if (boot.parentNode) boot.parentNode.removeChild(boot)
    }, reduce ? 220 : 780))
  }

  function run() {
    if (window.location.search.indexOf('nosplash') !== -1) {
      finish()
      return
    }
    if (reduce) {
      setProgress(100)
      if (log) log.textContent = '链路就绪 · 欢迎回来'
      timers.push(window.setTimeout(finish, 700))
      return
    }

    var startedAt = performance.now()
    var span = 2350
    function tick(now) {
      if (finished) return
      var t = Math.min(1, (now - startedAt) / span)
      // Ease-out: the bar decelerates into 100% instead of hitting a wall.
      setProgress((1 - Math.pow(1 - t, 2.4)) * 100)
      if (t < 1) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)

    for (var i = 0; i < LOGS.length; i++) {
      (function (at, text) {
        timers.push(window.setTimeout(function () {
          if (log && !finished) log.textContent = text
        }, at))
      })(LOGS[i][0], LOGS[i][1])
    }

    timers.push(window.setTimeout(finish, 2580))
  }

  boot.addEventListener('click', finish)
  window.addEventListener('keydown', finish, { once: true })

  run()
})()
