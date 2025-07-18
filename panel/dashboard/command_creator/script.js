class BlockEditor {
    constructor() {
        this.blocks = [];
        this.connections = [];
        this.draggedBlock = null;
        this.draggedConnection = null;
        this.embedData = {};
        this.customCommands = [];
        this.variables = [];
        this.embedVariables = new Map();
        this.componentEvents = new Map();
        this.snapDistance = 15;
        this.connectionStartNode = null;
        this.tempConnectionLine = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.setupEmbedEditor();
    }
    
    setupEventListeners() {
        document.getElementById('generate-code').addEventListener('click', () => {
            this.exportCode();
        });
        
        document.getElementById('clear-workspace').addEventListener('click', () => {
            this.clearWorkspace();
        });
        
        // Modal events
        document.querySelector('.close').addEventListener('click', () => {
            this.closeModal();
        });
        
        document.getElementById('save-embed').addEventListener('click', () => {
            this.saveEmbed();
        });
        
        document.getElementById('cancel-embed').addEventListener('click', () => {
            this.closeModal();
        });
        
        // Embed editor events
        document.getElementById('embed-title').addEventListener('input', () => this.updateEmbedPreview());
        document.getElementById('embed-description').addEventListener('input', () => this.updateEmbedPreview());
        document.getElementById('embed-color').addEventListener('input', () => this.updateEmbedPreview());
        document.getElementById('embed-author').addEventListener('input', () => this.updateEmbedPreview());
        document.getElementById('embed-footer').addEventListener('input', () => this.updateEmbedPreview());
        document.getElementById('embed-image').addEventListener('input', () => this.updateEmbedPreview());
        document.getElementById('embed-thumbnail').addEventListener('input', () => this.updateEmbedPreview());
        
        // Modal click outside to close
        document.getElementById('embed-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('embed-modal')) {
                this.closeModal();
            }
        });
    }
    
    setupDragAndDrop() {
        const toolboxBlocks = document.querySelectorAll('.block-item');
        const workspaceArea = document.getElementById('workspace-area');
        
        toolboxBlocks.forEach(block => {
            block.addEventListener('dragstart', (e) => {
                this.draggedBlock = this.createBlockFromTemplate(block);
                e.dataTransfer.effectAllowed = 'copy';
                block.classList.add('dragging');
            });
            
            block.addEventListener('dragend', (e) => {
                block.classList.remove('dragging');
            });
            
            block.setAttribute('draggable', true);
        });
        
        workspaceArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            workspaceArea.classList.add('drag-over');
        });
        
        workspaceArea.addEventListener('dragleave', () => {
            workspaceArea.classList.remove('drag-over');
        });
        
        workspaceArea.addEventListener('drop', (e) => {
            e.preventDefault();
            workspaceArea.classList.remove('drag-over');
            
            if (this.draggedBlock) {
                const rect = workspaceArea.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                this.addBlockToWorkspace(this.draggedBlock, x, y);
                this.draggedBlock = null;
            }
        });
    }
    
    createBlockFromTemplate(templateBlock) {
        const blockType = templateBlock.getAttribute('data-type');
        const blockData = {
            id: this.generateId(),
            type: blockType,
            category: this.getBlockCategory(templateBlock),
            inputs: this.extractInputs(templateBlock),
            x: 0,
            y: 0
        };
        
        return blockData;
    }
    
    getBlockCategory(block) {
        if (block.classList.contains('event-block')) return 'event';
        if (block.classList.contains('command-block')) return 'command';
        if (block.classList.contains('action-block')) return 'action';
        if (block.classList.contains('variable-block')) return 'variable';
        if (block.classList.contains('math-block')) return 'math';
        if (block.classList.contains('code-block')) return 'code';
        return 'unknown';
    }
    
    extractInputs(block) {
        const inputs = {};
        const inputElements = block.querySelectorAll('input');
        inputElements.forEach((input, index) => {
            inputs[`input${index}`] = input.placeholder || '';
        });
        return inputs;
    }
    
    addBlockToWorkspace(blockData, x, y) {
        blockData.x = x;
        blockData.y = y;
        this.blocks.push(blockData);
        
        const blockElement = this.createBlockElement(blockData);
        blockElement.style.left = x + 'px';
        blockElement.style.top = y + 'px';
        
        document.getElementById('workspace-area').appendChild(blockElement);
    }
    
    createBlockElement(blockData) {
        const blockElement = document.createElement('div');
        blockElement.className = `block-item workspace-block ${blockData.category}-block`;
        blockElement.setAttribute('data-block-id', blockData.id);
        
        const header = document.createElement('div');
        header.className = 'block-header';
        header.innerHTML = this.getBlockHTML(blockData);
        blockElement.appendChild(header);
        
        // Add input node (top) for non-event blocks
        if (blockData.category !== 'event' && blockData.category !== 'command') {
            const inputNode = document.createElement('div');
            inputNode.className = 'node input-node';
            inputNode.setAttribute('data-node-type', 'input');
            inputNode.setAttribute('data-block-id', blockData.id);
            blockElement.appendChild(inputNode);
            this.setupNodeEvents(inputNode);
        }
        
        // Add output node (bottom) for blocks that can connect to others
        if (blockData.category === 'event' || blockData.category === 'command' || blockData.category === 'action' || blockData.category === 'code') {
            const outputNode = document.createElement('div');
            outputNode.className = 'node output-node';
            outputNode.setAttribute('data-node-type', 'output');
            outputNode.setAttribute('data-block-id', blockData.id);
            blockElement.appendChild(outputNode);
            this.setupNodeEvents(outputNode);
        }
        
        // Add special buttons
        if (blockData.type === 'create-embed') {
            const embedBtn = document.createElement('button');
            embedBtn.className = 'embed-editor-btn';
            embedBtn.textContent = 'Edit Embed';
            embedBtn.addEventListener('click', () => {
                this.openEmbedEditor(blockData.id);
            });
            blockElement.appendChild(embedBtn);
        }
        
        // Make workspace blocks draggable
        this.makeBlockDraggable(blockElement);
        
        return blockElement;
    }
    
    setupNodeEvents(node) {
        const workspace = document.getElementById('workspace-area');
        
        node.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const nodeType = node.getAttribute('data-node-type');
            const blockId = node.getAttribute('data-block-id');
            
            if (nodeType === 'output') {
                // Start creating a connection from output node
                this.connectionStartNode = { node, blockId, type: 'output' };
                this.startConnectionDrag(e, node);
            } else if (nodeType === 'input') {
                // Check if there's already a connection to this input
                const existingConnection = this.connections.find(conn => 
                    conn.toBlockId === blockId && conn.toNodeType === 'input'
                );
                
                if (existingConnection) {
                    // Start dragging from the existing connection
                    this.connectionStartNode = { 
                        node: document.querySelector(`[data-block-id="${existingConnection.fromBlockId}"] .output-node`), 
                        blockId: existingConnection.fromBlockId, 
                        type: 'output' 
                    };
                    this.removeConnection(existingConnection);
                    this.startConnectionDrag(e, this.connectionStartNode.node);
                }
            }
        });
        
        node.addEventListener('mouseenter', (e) => {
            if (this.connectionStartNode && this.tempConnectionLine) {
                const nodeType = node.getAttribute('data-node-type');
                const blockId = node.getAttribute('data-block-id');
                
                // Check if this is a valid connection target
                if (this.canConnectNodes(this.connectionStartNode, { node, blockId, type: nodeType })) {
                    node.classList.add('node-highlight');
                }
            }
        });
        
        node.addEventListener('mouseleave', (e) => {
            node.classList.remove('node-highlight');
        });
        
        node.addEventListener('mouseup', (e) => {
            if (this.connectionStartNode && this.tempConnectionLine) {
                const nodeType = node.getAttribute('data-node-type');
                const blockId = node.getAttribute('data-block-id');
                const targetNode = { node, blockId, type: nodeType };
                
                if (this.canConnectNodes(this.connectionStartNode, targetNode)) {
                    this.createConnection(this.connectionStartNode, targetNode);
                }
                
                this.endConnectionDrag();
            }
        });
    }
    
    startConnectionDrag(e, startNode) {
        const workspace = document.getElementById('workspace-area');
        const workspaceRect = workspace.getBoundingClientRect();
        const nodeRect = startNode.getBoundingClientRect();
        
        // Create temporary connection line
        this.tempConnectionLine = document.createElement('div');
        this.tempConnectionLine.className = 'temp-connection-line';
        workspace.appendChild(this.tempConnectionLine);
        
        const startX = nodeRect.left - workspaceRect.left + nodeRect.width / 2;
        const startY = nodeRect.bottom - workspaceRect.top;
        
        this.updateTempConnectionLine(startX, startY, startX, startY);
        
        // Track mouse movement
        const mouseMoveHandler = (e) => {
            const endX = e.clientX - workspaceRect.left;
            const endY = e.clientY - workspaceRect.top;
            this.updateTempConnectionLine(startX, startY, endX, endY);
        };
        
        const mouseUpHandler = (e) => {
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
            this.endConnectionDrag();
        };
        
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    }
    
    updateTempConnectionLine(startX, startY, endX, endY) {
        if (!this.tempConnectionLine) return;
        
        const dx = endX - startX;
        const dy = endY - startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        this.tempConnectionLine.style.width = length + 'px';
        this.tempConnectionLine.style.left = startX + 'px';
        this.tempConnectionLine.style.top = startY + 'px';
        this.tempConnectionLine.style.transform = `rotate(${angle}deg)`;
        this.tempConnectionLine.style.transformOrigin = '0 50%';
    }
    
    endConnectionDrag() {
        if (this.tempConnectionLine) {
            this.tempConnectionLine.remove();
            this.tempConnectionLine = null;
        }
        this.connectionStartNode = null;
        
        // Remove all highlights
        document.querySelectorAll('.node-highlight').forEach(node => {
            node.classList.remove('node-highlight');
        });
    }
    
    canConnectNodes(fromNode, toNode) {
        // Can't connect to self
        if (fromNode.blockId === toNode.blockId) return false;
        
        // Can only connect output to input
        if (fromNode.type !== 'output' || toNode.type !== 'input') return false;
        
        // Check if target already has a connection
        const existingConnection = this.connections.find(conn => 
            conn.toBlockId === toNode.blockId && conn.toNodeType === 'input'
        );
        if (existingConnection) return false;
        
        // Get block categories
        const fromBlock = this.blocks.find(b => b.id === fromNode.blockId);
        const toBlock = this.blocks.find(b => b.id === toNode.blockId);
        
        if (!fromBlock || !toBlock) return false;
        
        // Event and command blocks can connect to action blocks
        if ((fromBlock.category === 'event' || fromBlock.category === 'command' || fromBlock.category === 'code') && 
            (toBlock.category === 'action' || toBlock.category === 'code')) {
            return true;
        }
        
        // Action blocks can connect to other action blocks
        if (fromBlock.category === 'action' && (toBlock.category === 'action' || toBlock.category === 'code')) {
            return true;
        }
        
        // Code blocks can connect to other code blocks and actions
        if (fromBlock.category === 'code' && (toBlock.category === 'action' || toBlock.category === 'code')) {
            return true;
        }
        
        return false;
    }
    
    createConnection(fromNode, toNode) {
        const connection = {
            id: this.generateId(),
            fromBlockId: fromNode.blockId,
            fromNodeType: fromNode.type,
            toBlockId: toNode.blockId,
            toNodeType: toNode.type
        };
        
        this.connections.push(connection);
        this.drawConnection(connection);
    }
    
    drawConnection(connection) {
        const workspace = document.getElementById('workspace-area');
        const fromBlock = document.querySelector(`[data-block-id="${connection.fromBlockId}"]`);
        const toBlock = document.querySelector(`[data-block-id="${connection.toBlockId}"]`);
        
        if (!fromBlock || !toBlock) return;
        
        const fromNode = fromBlock.querySelector('.output-node');
        const toNode = toBlock.querySelector('.input-node');
        
        if (!fromNode || !toNode) return;
        
        const line = document.createElement('div');
        line.className = 'connection-line';
        line.setAttribute('data-connection-id', connection.id);
        
        workspace.appendChild(line);
        this.updateConnectionLine(line, fromNode, toNode);
        
        // Add click handler to remove connection
        line.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeConnection(connection);
        });
    }
    
    updateConnectionLine(line, fromNode, toNode) {
        const workspace = document.getElementById('workspace-area');
        const workspaceRect = workspace.getBoundingClientRect();
        const fromRect = fromNode.getBoundingClientRect();
        const toRect = toNode.getBoundingClientRect();
        
        const startX = fromRect.left - workspaceRect.left + fromRect.width / 2;
        const startY = fromRect.bottom - workspaceRect.top;
        const endX = toRect.left - workspaceRect.left + toRect.width / 2;
        const endY = toRect.top - workspaceRect.top;
        
        const dx = endX - startX;
        const dy = endY - startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        line.style.width = length + 'px';
        line.style.left = startX + 'px';
        line.style.top = startY + 'px';
        line.style.transform = `rotate(${angle}deg)`;
        line.style.transformOrigin = '0 50%';
    }
    
    removeConnection(connection) {
        this.connections = this.connections.filter(conn => conn.id !== connection.id);
        const line = document.querySelector(`[data-connection-id="${connection.id}"]`);
        if (line) line.remove();
    }
    
    updateAllConnections() {
        // Only update if we have connections and blocks exist
        if (this.connections.length === 0) return;
        
        this.connections.forEach(connection => {
            const line = document.querySelector(`[data-connection-id="${connection.id}"]`);
            if (line && document.body.contains(line)) {
                const fromBlock = document.querySelector(`[data-block-id="${connection.fromBlockId}"]`);
                const toBlock = document.querySelector(`[data-block-id="${connection.toBlockId}"]`);
                
                if (fromBlock && toBlock && document.body.contains(fromBlock) && document.body.contains(toBlock)) {
                    const fromNode = fromBlock.querySelector('.output-node');
                    const toNode = toBlock.querySelector('.input-node');
                    
                    if (fromNode && toNode) {
                        this.updateConnectionLine(line, fromNode, toNode);
                    } else {
                        // Remove invalid connection
                        this.removeConnection(connection);
                    }
                } else {
                    // Remove connection if blocks don't exist
                    this.removeConnection(connection);
                }
            }
        });
    }
    
    getBlockHTML(blockData) {
        const templates = {
            'ready': 'When bot is ready',
            'click': 'When <input type="text" placeholder="component" data-input="component"> is clicked',
            'custom-command': 'Define command <input type="text" placeholder="name" data-input="name">',
            'reply': 'Reply <input type="text" placeholder="message" data-input="message">',
            'defer': 'Defer reply',
            'send-message': 'Send message in <input type="text" placeholder="channel ID" data-input="channelId">',
            'create-embed': 'Create embed',
            'set-variable': 'Set <input type="text" placeholder="variable" data-input="variable"> to <input type="text" placeholder="value" data-input="value">',
            'get-variable': 'Get <input type="text" placeholder="variable" data-input="variable">',
            'add': '<input type="text" placeholder="a" data-input="a"> + <input type="text" placeholder="b" data-input="b">',
            'subtract': '<input type="text" placeholder="a" data-input="a"> - <input type="text" placeholder="b" data-input="b">',
            'multiply': '<input type="text" placeholder="a" data-input="a"> × <input type="text" placeholder="b" data-input="b">',
            'divide': '<input type="text" placeholder="a" data-input="a"> ÷ <input type="text" placeholder="b" data-input="b">',
            'import-file': 'Import <input type="text" placeholder="filename" data-input="filename">',
            'export-function': 'Export function <input type="text" placeholder="name" data-input="name">',
            'call-function': 'Call <input type="text" placeholder="function" data-input="function">'
        };
        
        return templates[blockData.type] || 'Unknown block';
    }
    
    makeBlockDraggable(blockElement) {
        let isDragging = false;
        let startX, startY, initialX, initialY;
        
        const handleMouseDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.classList.contains('node')) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = parseInt(blockElement.style.left, 10);
            initialY = parseInt(blockElement.style.top, 10);
            
            blockElement.style.zIndex = '1000';
            blockElement.classList.add('dragging');
            e.preventDefault();
        };
        
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            
            const x = initialX + (e.clientX - startX);
            const y = initialY + (e.clientY - startY);
            
            blockElement.style.left = x + 'px';
            blockElement.style.top = y + 'px';
            
            // Update block data
            const blockId = blockElement.getAttribute('data-block-id');
            const block = this.blocks.find(b => b.id === blockId);
            if (block) {
                block.x = x;
                block.y = y;
            }
            
            // Update connection lines
            this.updateAllConnections();
        };
        
        const handleMouseUp = () => {
            if (isDragging) {
                isDragging = false;
                blockElement.style.zIndex = '1';
                blockElement.classList.remove('dragging');
                
                // Update block data
                const blockId = blockElement.getAttribute('data-block-id');
                const block = this.blocks.find(b => b.id === blockId);
                if (block) {
                    block.x = parseInt(blockElement.style.left, 10);
                    block.y = parseInt(blockElement.style.top, 10);
                }
            }
        };
        
        blockElement.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // Add double-click to remove
        blockElement.addEventListener('dblclick', () => {
            this.removeBlock(blockElement.getAttribute('data-block-id'));
        });
    }
    
    removeBlock(blockId) {
        // Remove all connections involving this block
        this.connections = this.connections.filter(connection => {
            if (connection.fromBlockId === blockId || connection.toBlockId === blockId) {
                const line = document.querySelector(`[data-connection-id="${connection.id}"]`);
                if (line) line.remove();
                return false;
            }
            return true;
        });
        
        this.blocks = this.blocks.filter(block => block.id !== blockId);
        const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
        if (blockElement) {
            blockElement.remove();
        }
    }
    
    clearWorkspace() {
        this.blocks = [];
        this.connections = [];
        document.getElementById('workspace-area').innerHTML = '';
    }
    
    setupEmbedEditor() {
        this.updateEmbedPreview();
    }
    
    openEmbedEditor(blockId) {
        this.currentEmbedBlockId = blockId;
        
        // Load existing embed data if available
        const block = this.blocks.find(b => b.id === blockId);
        if (block && block.embedData) {
            const embedData = block.embedData;
            document.getElementById('embed-title').value = embedData.title || '';
            document.getElementById('embed-description').value = embedData.description || '';
            document.getElementById('embed-color').value = embedData.color || '#0099ff';
            document.getElementById('embed-author').value = embedData.author || '';
            document.getElementById('embed-footer').value = embedData.footer || '';
            document.getElementById('embed-image').value = embedData.image || '';
            document.getElementById('embed-thumbnail').value = embedData.thumbnail || '';
        }
        
        document.getElementById('embed-modal').style.display = 'block';
        this.updateEmbedPreview();
    }
    
    closeModal() {
        document.getElementById('embed-modal').style.display = 'none';
    }
    
    updateEmbedPreview() {
        const title = document.getElementById('embed-title').value;
        const description = document.getElementById('embed-description').value;
        const color = document.getElementById('embed-color').value;
        const author = document.getElementById('embed-author').value;
        const footer = document.getElementById('embed-footer').value;
        const image = document.getElementById('embed-image').value;
        const thumbnail = document.getElementById('embed-thumbnail').value;
        
        let embedHTML = '<div class="discord-embed">';
        
        if (author) {
            embedHTML += `<div class="embed-author">${author}</div>`;
        }
        
        if (title) {
            embedHTML += `<div class="embed-title">${title}</div>`;
        }
        
        if (description) {
            embedHTML += `<div class="embed-description">${description}</div>`;
        }
        
        if (thumbnail) {
            embedHTML += `<img src="${thumbnail}" alt="Thumbnail" class="embed-thumbnail">`;
        }
        
        if (image) {
            embedHTML += `<img src="${image}" alt="Image" class="embed-image">`;
        }
        
        if (footer) {
            embedHTML += `<div class="embed-footer">${footer}</div>`;
        }
        
        embedHTML += '</div>';
        
        document.getElementById('embed-preview-content').innerHTML = embedHTML;
        
        // Update border color
        const embedElement = document.querySelector('.discord-embed');
        if (embedElement) {
            embedElement.style.borderLeftColor = color;
        }
    }
    
    saveEmbed() {
        const embedData = {
            title: document.getElementById('embed-title').value,
            description: document.getElementById('embed-description').value,
            color: document.getElementById('embed-color').value,
            author: document.getElementById('embed-author').value,
            footer: document.getElementById('embed-footer').value,
            image: document.getElementById('embed-image').value,
            thumbnail: document.getElementById('embed-thumbnail').value,
            components: [] // Will be populated with buttons/dropdowns
        };
        
        // Save embed data to the block
        const block = this.blocks.find(b => b.id === this.currentEmbedBlockId);
        if (block) {
            block.embedData = embedData;
            this.embedVariables.set(block.id, embedData);
            this.createComponentEventBlocks(block);
        }
        
        this.closeModal();
    }
    
    createComponentEventBlocks(embedBlock) {
        // Remove existing component event blocks for this embed
        const existingEvents = this.componentEvents.get(embedBlock.id) || [];
        existingEvents.forEach(eventBlockId => {
            this.removeBlock(eventBlockId);
        });
        
        // Create new component event blocks (placeholder for now)
        const componentEvents = [];
        const embedData = embedBlock.embedData;
        
        if (embedData && embedData.components) {
            embedData.components.forEach((component, index) => {
                const eventBlock = {
                    id: this.generateId(),
                    type: 'component-click',
                    category: 'event',
                    inputs: { component: component.customId },
                    x: embedBlock.x + 200,
                    y: embedBlock.y + (index * 60),
                    parentEmbedId: embedBlock.id
                };
                
                this.blocks.push(eventBlock);
                componentEvents.push(eventBlock.id);
                
                const blockElement = this.createBlockElement(eventBlock);
                blockElement.style.left = eventBlock.x + 'px';
                blockElement.style.top = eventBlock.y + 'px';
                blockElement.classList.add('component-event-block');
                
                document.getElementById('workspace-area').appendChild(blockElement);
            });
        }
        
        this.componentEvents.set(embedBlock.id, componentEvents);
    }
    
    exportCode() {
        const files = this.generateDiscordJSFiles();
        
        // Create and download files
        files.forEach(file => {
            this.downloadFile(file.name, file.content);
        });
        
        if (files.length === 0) {
            alert('No blocks to export. Add some event or command blocks to generate code.');
        } else {
            alert(`Generated ${files.length} file(s). Check your downloads folder.`);
        }
    }
    
    generateDiscordJSFiles() {
        const files = [];
        
        // Find root blocks (events and commands that have no incoming connections)
        const rootBlocks = this.blocks.filter(block => 
            (block.category === 'event' || block.category === 'command') && 
            !this.connections.some(conn => conn.toBlockId === block.id)
        );
        
        // Generate event files
        rootBlocks.filter(block => block.category === 'event').forEach(block => {
            const file = this.generateEventFile(block);
            if (file) files.push(file);
        });
        
        // Generate command files
        rootBlocks.filter(block => block.category === 'command').forEach(block => {
            const file = this.generateCommandFile(block);
            if (file) files.push(file);
        });
        
        return files;
    }
    
    generateEventFile(eventBlock) {
        const blockElement = document.querySelector(`[data-block-id="${eventBlock.id}"]`);
        let imports = new Set(['Events']);
        let code = '';
        let eventName = '';
        let once = false;
        
        if (eventBlock.type === 'ready') {
            eventName = 'Events.ClientReady';
            once = true;
            code += '\t\tconsole.log(\'Bot is ready!\');\n';
        } else if (eventBlock.type === 'click') {
            const componentId = this.getInputValue(blockElement, 'component');
            eventName = 'Events.InteractionCreate';
            once = false;
            code += `\t\tif (!interaction.isButton() && !interaction.isSelectMenu()) return;\n`;
            code += `\t\tif (interaction.customId === '${componentId}') {\n`;
        }
        
        // Get connected action chain
        const connectedActions = this.getConnectedActionChain(eventBlock);
        connectedActions.forEach(action => {
            const actionCode = this.generateActionCode(action, imports);
            if (eventBlock.type === 'click') {
                code += '\t\t\t' + actionCode + '\n';
            } else {
                code += '\t\t' + actionCode + '\n';
            }
        });
        
        if (eventBlock.type === 'click') {
            code += '\t\t}\n';
        }
        
        // Build the complete file
        let fileContent = '';
        if (imports.size > 0) {
            fileContent += `import { ${Array.from(imports).join(', ')} } from 'discord.js';\n\n`;
        }
        
        fileContent += `export default {\n`;
        fileContent += `\tname: ${eventName},\n`;
        fileContent += `\tonce: ${once},\n`;
        
        if (eventBlock.type === 'ready') {
            fileContent += `\texecute(client) {\n`;
        } else {
            fileContent += `\texecute(interaction) {\n`;
        }
        
        fileContent += code;
        fileContent += `\t},\n`;
        fileContent += `};\n`;
        
        const fileName = eventBlock.type === 'ready' ? 'ready.js' : `${eventBlock.type}-interaction.js`;
        
        return {
            name: fileName,
            content: fileContent
        };
    }
    
    generateCommandFile(commandBlock) {
        const blockElement = document.querySelector(`[data-block-id="${commandBlock.id}"]`);
        const commandName = this.getInputValue(blockElement, 'name');
        
        if (!commandName) return null;
        
        let imports = new Set(['SlashCommandBuilder']);
        let code = '';
        
        // Get connected action chain
        const connectedActions = this.getConnectedActionChain(commandBlock);
        connectedActions.forEach(action => {
            const actionCode = this.generateActionCode(action, imports);
            code += '\t\t' + actionCode + '\n';
        });
        
        // Build the complete file
        let fileContent = '';
        if (imports.size > 0) {
            fileContent += `import { ${Array.from(imports).join(', ')} } from 'discord.js';\n\n`;
        }
        
        fileContent += `export default {\n`;
        fileContent += `\tdata: new SlashCommandBuilder()\n`;
        fileContent += `\t\t.setName('${commandName}')\n`;
        fileContent += `\t\t.setDescription('${commandName} command'),\n`;
        fileContent += `\tasync execute(interaction) {\n`;
        fileContent += code;
        fileContent += `\t},\n`;
        fileContent += `};\n`;
        
        return {
            name: `${commandName}.js`,
            content: fileContent
        };
    }
    
    generateActionCode(actionBlock, imports) {
        const blockElement = document.querySelector(`[data-block-id="${actionBlock.id}"]`);
        
        // Check if this action is allowed in the current context
        if (!this.isActionAllowedInContext(actionBlock)) {
            return `// ${actionBlock.type} action (not allowed in this context)`;
        }
        
        switch (actionBlock.type) {
            case 'reply':
                const message = this.getInputValue(blockElement, 'message');
                return `await interaction.reply('${message || 'Hello!'}');`;
                
            case 'defer':
                return `await interaction.deferReply();`;
                
            case 'send-message':
                const channelId = this.getInputValue(blockElement, 'channelId');
                return `const channel = client.channels.cache.get('${channelId}');\n\t\tif (channel) await channel.send('Message');`;
                
            case 'create-embed':
                imports.add('EmbedBuilder');
                return this.generateEmbedCode(actionBlock);
                
            case 'set-variable':
                const varName = this.getInputValue(blockElement, 'variable');
                const varValue = this.getInputValue(blockElement, 'value');
                return `// Set variable: ${varName || 'variable'} = ${varValue || 'value'}`;
                
            case 'get-variable':
                const getVarName = this.getInputValue(blockElement, 'variable');
                return `// Get variable: ${getVarName || 'variable'}`;
                
            case 'import-file':
                const filename = this.getInputValue(blockElement, 'filename');
                return `// Import from ${filename || 'file'}`;
                
            case 'export-function':
                const funcName = this.getInputValue(blockElement, 'name');
                return `// Export function ${funcName || 'function'}`;
                
            case 'call-function':
                const callFunc = this.getInputValue(blockElement, 'function');
                return `// Call ${callFunc || 'function'}();`;
            default:
                return `// ${actionBlock.type} action`;
        }
    }
    
    generateEmbedCode(embedBlock) {
        const embedData = embedBlock.embedData || {};
        
        let code = `const embed = new EmbedBuilder()`;
        
        if (embedData.title) {
            code += `\n    .setTitle('${embedData.title}')`;
        }
        
        if (embedData.description) {
            code += `\n    .setDescription('${embedData.description}')`;
        }
        
        if (embedData.color) {
            code += `\n    .setColor('${embedData.color}')`;
        }
        
        if (embedData.author) {
            code += `\n    .setAuthor({ name: '${embedData.author}' })`;
        }
        
        if (embedData.footer) {
            code += `\n    .setFooter({ text: '${embedData.footer}' })`;
        }
        
        if (embedData.image) {
            code += `\n    .setImage('${embedData.image}')`;
        }
        
        if (embedData.thumbnail) {
            code += `\n    .setThumbnail('${embedData.thumbnail}')`;
        }
        
        code += `;
        
\t\tawait interaction.reply({ embeds: [embed] });`;
        
        return code;
    }
    
    isActionAllowedInContext(actionBlock) {
        // Find the root block (event or command) for this action
        const rootBlock = this.findRootBlock(actionBlock);
        
        if (!rootBlock) return true; // Allow if no root found
        
        // Reply, defer, and create-embed are only allowed in command contexts
        if (['reply', 'defer', 'create-embed'].includes(actionBlock.type)) {
            return rootBlock.category === 'command';
        }
        
        return true; // Allow all other actions
    }
    
    findRootBlock(block) {
        // Traverse up the connection chain to find the root
        let currentBlock = block;
        const visited = new Set();
        
        while (currentBlock && !visited.has(currentBlock.id)) {
            visited.add(currentBlock.id);
            
            if (currentBlock.category === 'event' || currentBlock.category === 'command') {
                return currentBlock;
            }
            
            // Find incoming connection
            const incomingConnection = this.connections.find(conn => conn.toBlockId === currentBlock.id);
            if (incomingConnection) {
                currentBlock = this.blocks.find(b => b.id === incomingConnection.fromBlockId);
            } else {
                break;
            }
        }
        
        return null;
    }
    
    getConnectedActionChain(startBlock) {
        const chain = [];
        let currentBlock = startBlock;
        
        // Follow the connection chain
        while (currentBlock) {
            const connection = this.connections.find(conn => conn.fromBlockId === currentBlock.id);
            if (connection) {
                const nextBlock = this.blocks.find(b => b.id === connection.toBlockId);
                if (nextBlock) {
                    chain.push(nextBlock);
                    currentBlock = nextBlock;
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        
        return chain;
    }
    
    downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    getInputValue(blockElement, inputName) {
        const input = blockElement.querySelector(`[data-input="${inputName}"]`);
        return input ? input.value : '';
    }
    
    generateId() {
        return 'block_' + Math.random().toString(36).substr(2, 9);
    }
}

// Initialize the editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new BlockEditor();
});