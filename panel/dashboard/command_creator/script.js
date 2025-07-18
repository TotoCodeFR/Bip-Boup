// --- Define blocks ---

Blockly.Blocks['command_definition'] = {
    init: function () {
      this.appendDummyInput()
        .appendField("Command:")
        .appendField(new Blockly.FieldLabel(this.commandName || "<undefined>"), "COMMAND_LABEL");
      this.appendStatementInput("COMMAND_BODY")
        .setCheck('command_chain')
        .appendField("do");
      this.setColour(290);
      this.setTooltip("Slash command definition");
      this.setHelpUrl("");
      this.setDeletable(true);
      this.setMovable(true);
      this.setNextStatement(true);
      this.setPreviousStatement(true);
      this.commandName = null;
      this.parameters = [];
    },
  
    mutationToDom: function () {
      const container = document.createElement('mutation');
      container.setAttribute('command_name', this.commandName || "");
      container.setAttribute('params', JSON.stringify(this.parameters || []));
      return container;
    },
  
    domToMutation: function (xmlElement) {
      this.commandName = xmlElement.getAttribute('command_name');
      this.parameters = JSON.parse(xmlElement.getAttribute('params') || '[]');
      this.setFieldValue(this.commandName || "<undefined>", "COMMAND_LABEL");
    }
  };
  
  Blockly.JavaScript.forBlock['command_definition'] = function (block) {
    const commandName = block.commandName || "unknown_command";
    const parameters = block.parameters || [];
    const bodyCode = Blockly.JavaScript.statementToCode(block, 'COMMAND_BODY');
  
    // Generate code to extract parameters from interaction.options
    let paramsCode = "";
    for (const param of parameters) {
      const varName = param.name;
      const isRequired = param.required ? true : false;
      let getCode = "getString";
      if (param.type === "INTEGER") getCode = "getInteger";
      else if (param.type === "BOOLEAN") getCode = "getBoolean";
      else if (param.type === "USER") getCode = "getUser";
      else if (param.type === "CHANNEL") getCode = "getChannel";
      else if (param.type === "ROLE") getCode = "getRole";
  
      paramsCode += `const ${varName} = interaction.options.${getCode}('${varName}', ${isRequired});\n  `;
    }
  
    return `
  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === '${commandName}') {
    ${paramsCode}
    ${bodyCode}
    }
  });
  `;
  };
  
  // Reply block
  Blockly.Blocks['reply'] = {
    init: function () {
      this.appendDummyInput()
        .appendField("Reply")
        .appendField(new Blockly.FieldTextInput("Hello!"), "TEXT");
      this.setPreviousStatement(true, 'command_chain');
      this.setNextStatement(true, 'command_chain');
      this.setColour(160);
      this.setTooltip("Reply to the interaction.");
    }
  };
  
  Blockly.JavaScript.forBlock['reply'] = function (block) {
    const msg = block.getFieldValue('TEXT');
    return `
  if (interaction.deferred) {
    await interaction.editReply(${JSON.stringify(msg)});
  } else {
    if (interaction.replied) {
      await interaction.editReply(${JSON.stringify(msg)});
    } else {
      await interaction.reply(${JSON.stringify(msg)});
    }
  }
  `;
  };
  
  // Defer reply block
  Blockly.Blocks['defer_reply'] = {
    init: function () {
      this.appendDummyInput()
        .appendField("Defer reply");
      this.setPreviousStatement(true, 'command_chain');
      this.setNextStatement(true, 'command_chain');
      this.setColour(210);
      this.setTooltip("Defer the reply to the interaction.");
    }
  };
  
  Blockly.JavaScript.forBlock['defer_reply'] = function () {
    return `await interaction.deferReply();\n`;
  };
  
  // --- Setup workspace ---
  
  const toolbox = {
    kind: 'flyoutToolbox',
    contents: [
      { kind: 'button', text: '+ Create Command', callbackKey: 'CREATE_COMMAND' },
      { kind: 'block', type: 'reply' },
      { kind: 'block', type: 'defer_reply' },
    ]
  };
  
  const workspace = Blockly.inject('blocklyDiv', {
    toolbox: toolbox,
    renderer: 'geras',
    theme: Blockly.Themes.Classic,
    zoom: {
      controls: true,
      wheel: true,
      startScale: 1,
      maxScale: 1.5,
      minScale: 0.5,
      scaleSpeed: 1.05,
      pinch: true,
    },
    grid: {
      spacing: 20,
      length: 3,
      colour: '#ccc',
      snap: true,
    }
  });
  
  // Prevent flyout scaling on zoom
  workspace.addChangeListener(event => {
    if (event.type === Blockly.Events.VIEWPORT_CHANGE) {
      const flyout = workspace.getFlyout();
      if (flyout && flyout.svgGroup_) {
        flyout.svgGroup_.setAttribute('transform', 'scale(1)');
      }
    }
  });
  
  // Register button callback for + Create Command
  workspace.registerButtonCallback('CREATE_COMMAND', () => {
    openCommandPopup();
  });
  
  // --- Popup UI Logic ---
  
  const popupOverlay = document.getElementById('popupOverlay');
  const commandNameInput = document.getElementById('commandNameInput');
  const parametersList = document.getElementById('parametersList');
  const addParamBtn = document.getElementById('addParamBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const createBtn = document.getElementById('createBtn');
  
  function openCommandPopup() {
    popupOverlay.style.display = 'flex';
    commandNameInput.value = '';
    parametersList.innerHTML = '';
    addParameterInput(); // Start with one param input by default
  }
  
  function addParameterInput(name = '', type = 'STRING', required = true) {
    const div = document.createElement('div');
  
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'param name';
    nameInput.value = name;
  
    const typeSelect = document.createElement('select');
    ['STRING', 'INTEGER', 'BOOLEAN', 'USER', 'CHANNEL', 'ROLE'].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (t === type) opt.selected = true;
      typeSelect.appendChild(opt);
    });
  
    const requiredSelect = document.createElement('select');
    requiredSelect.classList.add('optional-select');
    [['Required', true], ['Optional', false]].forEach(([text, val]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = text;
      if (val === required) opt.selected = true;
      requiredSelect.appendChild(opt);
    });
  
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove parameter';
    removeBtn.classList.add('removeParamBtn');
    removeBtn.onclick = () => {
      parametersList.removeChild(div);
    };
  
    div.appendChild(nameInput);
    div.appendChild(typeSelect);
    div.appendChild(requiredSelect);
    div.appendChild(removeBtn);
    parametersList.appendChild(div);
  }
  
  addParamBtn.onclick = () => addParameterInput();
  
  cancelBtn.onclick = () => {
    popupOverlay.style.display = 'none';
  };
  
  createBtn.onclick = () => {
    const commandName = commandNameInput.value.trim();
    if (!commandName) {
      alert("Please enter a command name.");
      return;
    }
    const params = [];
    for (const div of parametersList.children) {
      const inputs = div.getElementsByTagName('input');
      const selects = div.getElementsByTagName('select');
      if (inputs.length === 0 || selects.length < 2) continue;
      const paramName = inputs[0].value.trim();
      const paramType = selects[0].value;
      const paramRequired = selects[1].value === 'true';
      if (!paramName) {
        alert("Parameter names cannot be empty.");
        return;
      }
      params.push({ name: paramName, type: paramType, required: paramRequired });
    }
  
    // Create new command_definition block
    const block = workspace.newBlock('command_definition');
    block.commandName = commandName;
    block.parameters = params;
    block.setFieldValue(commandName, "COMMAND_LABEL");
    block.initSvg();
    block.render();
  
    popupOverlay.style.display = 'none';
  };
  
  // --- Generate code button ---
  
  document.getElementById('generateBtn').addEventListener('click', () => {
    const code = Blockly.JavaScript.workspaceToCode(workspace);
    const win = window.open("", "Generated Code", "width=700,height=500");
    win.document.write(`<pre style="white-space: pre-wrap; font-family: monospace;">${code}</pre>`);
  });
  