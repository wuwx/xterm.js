var term,
    protocol,
    socketURL,
    socket,
    pid;

var terminalContainer = document.getElementById('terminal-container'),
    actionElements = {
      findNext: document.querySelector('#find-next'),
      findPrevious: document.querySelector('#find-previous')
    },
    optionElements = {
      cursorBlink: document.querySelector('#option-cursor-blink'),
      cursorStyle: document.querySelector('#option-cursor-style'),
      scrollback: document.querySelector('#option-scrollback'),
      tabstopwidth: document.querySelector('#option-tabstopwidth'),
      bellStyle: document.querySelector('#option-bell-style')
    },
    colsElement = document.getElementById('cols'),
    rowsElement = document.getElementById('rows');

function setTerminalSize() {
  var cols = parseInt(colsElement.value, 10);
  var rows = parseInt(rowsElement.value, 10);
  var viewportElement = document.querySelector('.xterm-viewport');
  var scrollBarWidth = viewportElement.offsetWidth - viewportElement.clientWidth;
  var width = (cols * term.charMeasure.width + 20 /*room for scrollbar*/).toString() + 'px';
  var height = (rows * term.charMeasure.height).toString() + 'px';

  terminalContainer.style.width = width;
  terminalContainer.style.height = height;
  term.resize(cols, rows);
}

colsElement.addEventListener('change', setTerminalSize);
rowsElement.addEventListener('change', setTerminalSize);

actionElements.findNext.addEventListener('keypress', function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    term.findNext(actionElements.findNext.value);
  }
});
actionElements.findPrevious.addEventListener('keypress', function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    term.findPrevious(actionElements.findPrevious.value);
  }
});

optionElements.cursorBlink.addEventListener('change', function () {
  term.setOption('cursorBlink', optionElements.cursorBlink.checked);
});
optionElements.cursorStyle.addEventListener('change', function () {
  term.setOption('cursorStyle', optionElements.cursorStyle.value);
});
optionElements.bellStyle.addEventListener('change', function () {
  term.setOption('bellStyle', optionElements.bellStyle.value);
});
optionElements.scrollback.addEventListener('change', function () {
  term.setOption('scrollback', parseInt(optionElements.scrollback.value, 10));
});
optionElements.tabstopwidth.addEventListener('change', function () {
  term.setOption('tabStopWidth', parseInt(optionElements.tabstopwidth.value, 10));
});

createTerminal();

function createTerminal() {
  // Clean terminal
  while (terminalContainer.children.length) {
    terminalContainer.removeChild(terminalContainer.children[0]);
  }
  term = new Terminal({
    cursorBlink: optionElements.cursorBlink.checked,
    scrollback: parseInt(optionElements.scrollback.value, 10),
    tabStopWidth: parseInt(optionElements.tabstopwidth.value, 10)
  });
  term.on('resize', function (size) {
    if (!pid) {
      return;
    }
    var cols = size.cols,
        rows = size.rows,
        url = '/terminals/' + pid + '/size?cols=' + cols + '&rows=' + rows;

    fetch(url, {method: 'POST'});
  });
  protocol = (location.protocol === 'https:') ? 'wss://' : 'ws://';
  socketURL = protocol + location.hostname + ((location.port) ? (':' + location.port) : '') + '/terminals/';

  term.open(terminalContainer);
  term.fit();

  // fit is called within a setTimeout, cols and rows need this.
  setTimeout(function () {
    colsElement.value = term.cols;
    rowsElement.value = term.rows;

    // Set terminal size again to set the specific dimensions on the demo
    setTerminalSize();

    fetch('/terminals?cols=' + term.cols + '&rows=' + term.rows, {method: 'POST'}).then(function (res) {

      res.text().then(function (pid) {
        window.pid = pid;
        socketURL += pid;
        socket = new WebSocket(socketURL);
        socket.onopen = runRealTerminal;
        socket.onclose = runFakeTerminal;
        socket.onerror = runFakeTerminal;

        term.zmodemAttach(socket, {
            noTerminalWriteOutsideSession: true,
        } );

        term.on("zmodemDetect", (detection) => {
            term.detach();
            let zsession = detection.confirm();

            var promise;

            if (zsession.type === "receive") {
                promise = zmodemHandleReceiveSession(zsession);
            }
            else {
                promise = zmodemHandleSendSession(zsession);
            }

            promise.catch( console.error.bind(console) ).then( () => {
                term.attach(socket);
            } );
        });
      });
    });
  }, 0);
}

function zmodemHandleReceiveSession(zsession) {
    zsession.on("offer", function(xfer) {
        xfer.accept().then(
            (inputs) => {
                Zmodem.Browser.save_to_disk(inputs, xfer.get_details().name);
            },
            console.error.bind(console)
        );
    } );

    var promise = new Promise( (res) => {
        zsession.on("session_end", res);
    } );

    zsession.start();

    return promise;
}

function zmodemHandleSendSession(zsession) {
    var choose_form = document.getElementById("zm_choose");
    choose_form.style.display = "";

    return new Promise( (res) => {
        choose_form.onsubmit = function(e) {
            choose_form.style.display = "none";

            var file_el = document.getElementById("zm_files");
            var files_obj = file_el.files;

            Zmodem.Browser.send_files(
                zsession,
                files_obj
            ).then(
                zsession.close.bind(zsession),
                console.error.bind(console)
            ).then(res);
        };
    } );
}

function runRealTerminal() {
  term.attach(socket);
  term._initialized = true;
}

function runFakeTerminal() {
  if (term._initialized) {
    return;
  }

  term._initialized = true;

  var shellprompt = '$ ';

  term.prompt = function () {
    term.write('\r\n' + shellprompt);
  };

  term.writeln('Welcome to xterm.js');
  term.writeln('This is a local terminal emulation, without a real terminal in the back-end.');
  term.writeln('Type some keys and commands to play around.');
  term.writeln('');
  term.prompt();

  term.on('key', function (key, ev) {
    var printable = (
      !ev.altKey && !ev.altGraphKey && !ev.ctrlKey && !ev.metaKey
    );

    if (ev.keyCode == 13) {
      term.prompt();
    } else if (ev.keyCode == 8) {
     // Do not delete the prompt
      if (term.x > 2) {
        term.write('\b \b');
      }
    } else if (printable) {
      term.write(key);
    }
  });

  term.on('paste', function (data, ev) {
    term.write(data);
  });
}
