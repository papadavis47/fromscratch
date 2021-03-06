import React from 'react';
import Codemirror from 'react-codemirror';
import CodeMirror from '../../node_modules/codemirror';

import Shortcuts from '../components/Shortcuts';

require('../../node_modules/codemirror/addon/scroll/scrollpastend.js');
require('../../node_modules/codemirror/addon/scroll/simplescrollbars.js');
require('../../node_modules/codemirror/addon/selection/active-line.js');
require('../../node_modules/codemirror/addon/fold/indent-fold.js');
require('../../node_modules/codemirror/addon/fold/foldgutter.js');

require('../../node_modules/codemirror/addon/search/search.js');
require('../../node_modules/codemirror/addon/search/jump-to-line.js');
require('../../node_modules/codemirror/addon/search/matchesonscrollbar.js');

require('../../node_modules/codemirror/keymap/sublime.js');

const { ipcRenderer: ipc, remote, shell } = require('electron');

const handleContent = remote.getGlobal('handleContent');
const nodeStorage = remote.getGlobal('nodeStorage');
let latestVersion;

const CmdOrCtrl = process.platform === 'darwin' ? 'Cmd-' : 'Ctrl-';
const extraKeys = {
  'Shift-Tab': 'indentLess',
  Esc: 'clearSearch',
  'Alt-G': false,

  // from sublime.js package
  [`${CmdOrCtrl}Up`]: 'swapLineUp',
  [`${CmdOrCtrl}Down`]: 'swapLineDown',

  [`${CmdOrCtrl}K`]: cm => {
    cm.foldCode(cm.getCursor());
  },
  [`${CmdOrCtrl}[`]: cm => {
    cm.foldCode(cm.getCursor());
  },
  [`${CmdOrCtrl}]`]: cm => {
    cm.foldCode(cm.getCursor());
  },
  [`${CmdOrCtrl}F`]: 'findPersistent',
  [`Shift-${CmdOrCtrl}F`]: 'replace',
  [`Shift-${CmdOrCtrl}R`]: 'replaceAll',
  [`${CmdOrCtrl}G`]: 'jumpToLine',

  [`${CmdOrCtrl}L`]: cm => {
    checkboxSupport(cm);
  },
  [`${CmdOrCtrl}/`]: cm => {
    checkboxSupport(cm);
  },
};
const checkboxSupport = cm => {
  cm.listSelections().forEach(selection => {
    const firstLine = Math.min(selection.anchor.line, selection.head.line);
    const lastLine = Math.max(selection.anchor.line, selection.head.line);
    let currentLineNumber;

    for (currentLineNumber = firstLine; currentLineNumber <= lastLine; currentLineNumber += 1) {
      const currentLine = cm.getLine(currentLineNumber);
      const stringPadding = Math.max(currentLine.search(/\S/), 0);
      const trimmedLine = currentLine.trimLeft();

      const checkbox = {
        checked: '[✓] ',
        unchecked: '[ ] ',
      };

      const pos = {
        from: {
          line: currentLineNumber,
          ch: 0 + stringPadding,
        },
        to: {
          line: currentLineNumber,
          ch: 4 + stringPadding,
        },
      };

      if (trimmedLine.trim() === '') {
        // append checkbox to empty line
        cm.replaceRange(checkbox.unchecked, { line: currentLineNumber, ch: currentLine.length });
      } else if (trimmedLine.startsWith(checkbox.checked)) {
        // make it unchecked
        cm.replaceRange(checkbox.unchecked, pos.from, pos.to);
      } else if (trimmedLine.startsWith(checkbox.unchecked)) {
        // make it checked
        cm.replaceRange(checkbox.checked, pos.from, pos.to);
      } else {
        // add a checkbox!
        cm.replaceRange(checkbox.unchecked, pos.from);
      }
    }
  });
};

export default class FromScratch extends React.Component {
  static defaultProps = {
    content:
      '|> Welcome to FromScratch.\n\n\n' +
      "This app saves everything you type automatically, there's no need to save manually." +
      '\n\nYou can type neat arrows like these: ' +
      '->, -->, ->> and =>, courtesy of the font "Fira Code".\n\n' +
      '\tFromScratch also does automatic indenting\n' +
      "\tand more. So delete this text & let's go!",
  };

  constructor(props) {
    super();

    const content = handleContent.read();

    this.state = {
      content: content !== false ? content : props.content,
      fontSize: nodeStorage.getItem('fontSize') || 1,
      lightTheme: nodeStorage.getItem('lightTheme') || false,
      folds: (() => {
        const foldItem = nodeStorage.getItem('folds');
        return foldItem && foldItem.folds ? foldItem.folds : [];
      })(),
      mock: 'nosave',
      update: 'updater',
      shortcutsVisible: false,
    };
  }

  componentDidMount() {
    const { editor } = this;
    ipc.on('executeShortCut', (event, shortcut) => {
      switch (shortcut) {
        case 'save':
          this.showMockMessage();
          break;
        case 'reset-font':
          this.updateFont(0, true);
          break;
        case 'increase-font':
          this.updateFont(0.1);
          break;
        case 'decrease-font':
          this.updateFont(-0.1);
          break;
        case 'toggle-theme':
          this.updateTheme();
          break;
        case 'toggle-shortcuts':
          this.toggleShortcutsVisible();
          break;
        case 'show-update-msg':
          latestVersion = remote.getGlobal('latestVersion');
          this.showUpdateMessage();
          break;
        default:
          break;
      }
    });

    const cmInstance = editor.getCodeMirror();
    this.applyFolds(cmInstance);

    cmInstance.on('fold', () => {
      this.updateFolds();
    });

    cmInstance.on('unfold', () => {
      this.updateFolds();
    });

    document.body.dataset.platform = process.platform;
    ipc.send('setVibrancy', this.state.lightTheme);

    document.addEventListener('dragover', event => event.preventDefault());
    document.addEventListener('drop', event => event.preventDefault());
  }

  componentDidUpdate() {
    ipc.send('writeContent', this.state.content);
    this.updateFolds();
  }

  applyFolds(cm) {
    this.state.folds.forEach(fold => {
      cm.foldCode(CodeMirror.Pos.apply(this, fold));
    });
  }

  updateFolds() {
    const { editor } = this;
    const newFolds = editor
      .getCodeMirror()
      .getAllMarks()
      .filter(mark => mark.collapsed && mark.type === 'range')
      .reverse()
      .map(mark => {
        const pos = mark.find().from;
        return [pos.line, pos.ch];
      });

    nodeStorage.setItem('folds', { folds: newFolds });
  }

  showMockMessage() {
    clearTimeout(window.hideSaveMessage);
    this.setState({ mock: 'nosave active' });
    window.hideSaveMessage = setTimeout(() => {
      this.setState({ mock: 'nosave' });
    }, 1000);
  }

  showUpdateMessage() {
    const hideMessageFor = nodeStorage.getItem('hideUpdateMessage');
    const hideVersion = hideMessageFor ? hideMessageFor.version : false;

    if (latestVersion !== hideVersion) {
      this.setState({ update: 'updater active' });
    }
  }

  updateFont(diff, reset) {
    const newFontsize = reset ? 1 : Math.min(Math.max(this.state.fontSize + diff, 0.5), 2.5);
    nodeStorage.setItem('fontSize', newFontsize);
    this.setState({ fontSize: newFontsize });
  }

  updateTheme() {
    const lightTheme = !this.state.lightTheme;

    nodeStorage.setItem('lightTheme', lightTheme);

    ipc.send('setVibrancy', lightTheme);
    this.setState({ lightTheme });
  }

  handleChange = newcontent => {
    this.setState({ content: newcontent });
  };

  openDownloadPage = () => {
    shell.openExternal('https://fromscratch.rocks');
    this.setState({ update: 'updater' });
  };

  hideUpdateMessage = e => {
    e.stopPropagation();
    nodeStorage.setItem('hideUpdateMessage', { version: latestVersion });
    this.setState({ update: 'updater' });
  };

  toggleShortcutsVisible = () => {
    this.setState({ shortcutsVisible: !this.state.shortcutsVisible });
  };

  render() {
    const style = {
      fontSize: `${this.state.fontSize}rem`,
      ...(this.state.lightTheme
        ? { filter: 'invert(100%) hue-rotate(20deg) brightness(1.1) contrast(1.4) grayscale(20%)' }
        : {}),
    };
    const options = {
      styleActiveLine: true,
      lineNumbers: false,
      lineWrapping: true,
      theme: 'fromscratch',
      autofocus: true,
      scrollbarStyle: 'overlay',
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: true,
      cursorScrollMargin: 40,
      foldOptions: {
        rangeFinder: CodeMirror.fold.indent,
        scanUp: true,
        widget: ' … ',
      },
      foldGutter: true,
      gutters: ['CodeMirror-foldgutter'],
      extraKeys,
    };
    return (
      <div style={style} data-platform={process.platform}>
        <Codemirror
          value={this.state.content}
          ref={c => {
            this.editor = c;
          }}
          onChange={this.handleChange}
          options={options}
        />
        <div className={this.state.mock}>Already saved! ;)</div>

        <div onClick={this.openDownloadPage} className={this.state.update}>
          There's an update available! Get version {latestVersion}
          <span title="Don't show this again until next available update" onClick={this.hideUpdateMessage}>
            ×
          </span>
        </div>

        <div className="titlebar" />

        <Shortcuts visible={this.state.shortcutsVisible} toggleShortcutsVisible={this.toggleShortcutsVisible} />
      </div>
    );
  }
}
