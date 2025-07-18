let workspace;

window.addEventListener('load', () => {
  workspace = Blockly.inject('blocklyDiv', {
    toolbox: document.getElementById('toolbox'),
    theme: Blockly.Themes.Classic,
  });

  document.getElementById('createCommandBtn').addEventListener('click', () => {
    openCreateCommandDialog();
  });
});

// Define blocks

Blockly.Blocks['create_command'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("when slash command")
      .appendField(new Blockly.FieldTextInput("command_name"), "CMD_NAME");

    this.setNextStatement(true, null);
    this.setStyle('command_blocks');
    this.setDeletable(true);
  }
};

Blockly.JavaScript['create_command'] = function(block) {
  const cmdName = block.getFieldValue('CMD_NAME');
  return `// Slash command: /${cmdName}\n`;
};

Blockly.Blocks['reply_block'] = {
  init: function () {
    this.appendValueInput("REPLY")
      .setCheck("String")
      .appendField("reply with");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('reply_blocks');
  }
};

Blockly.JavaScript['reply_block'] = function(block) {
  const reply = Blockly.JavaScript.valueToCode(block, 'REPLY', Blockly.JavaScript.ORDER_ATOMIC);
  return `
if (interaction.deferred || interaction.replied) {
  interaction.editReply(${reply});
} else {
  interaction.reply(${reply});
}
`;
};

Blockly.Blocks['defer_reply'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("make bot think");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('reply_blocks');
  }
};

Blockly.JavaScript['defer_reply'] = function() {
  return `interaction.deferReply();\n`;
};

// Popup for creating a command with parameters

function openCreateCommandDialog() {
  const cmdName = prompt("Enter command name:");
  if (!cmdName) return;

  const paramCount = parseInt(prompt("How many parameters? (0-5)"), 10) || 0;
  const params = [];

  for (let i = 0; i < paramCount; i++) {
    const paramName = prompt(`Parameter ${i+1} name:`);
    if (!paramName) continue;
    const optional = confirm(`Is "${paramName}" optional?`);
    params.push({ name: paramName, optional });
  }

  createCustomCommandBlock(cmdName, params);
}

function createCustomCommandBlock(name, params) {
  const typeName = `command_${name.toLowerCase()}`;

  if (Blockly.Blocks[typeName]) {
    alert("This command already exists!");
    return;
  }

  Blockly.Blocks[typeName] = {
    init: function() {
      this.appendDummyInput()
        .appendField(`when /${name} command used`);
      params.forEach(p => {
        this.appendValueInput(p.name)
          .setCheck("String")
          .appendField(p.name);
      });
      this.setNextStatement(true, null);
      this.setStyle('command_blocks');
      this.setDeletable(true);
    }
  };

  Blockly.JavaScript[typeName] = function(block) {
    const argsCode = params.map(p => {
      return `const ${p.name} = interaction.options.get("${p.name}", ${!p.optional});`;
    }).join('\n');

    const innerCode = Blockly.JavaScript.statementToCode(block, 'DO');

    return `client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "${name}") {
    ${argsCode}
    ${innerCode}
  }
});
`;
  };

  // Add block to toolbox dynamically by rebuilding toolbox XML

  const toolboxXml = `
    <xml id="toolbox" style="display: none">
      <category name="Commands" categorystyle="command_blocks">
        <block type="${typeName}"></block>
      </category>
      <category name="Actions" categorystyle="reply_blocks">
        <block type="reply_block"></block>
        <block type="defer_reply"></block>
      </category>
      <category name="Variables" custom="VARIABLE"></category>
    </xml>
  `;

  workspace.updateToolbox(Blockly.utils.xml.textToDom(toolboxXml));
}
