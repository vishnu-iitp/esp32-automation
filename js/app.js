class HomeAutomationApp {
    constructor() {
        this.supabase = null;
        this.devices = [];
        this.isListening = false;
        this.recognition = null;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.loadSupabaseConfig();
        await this.initializeSupabase();
        await this.fetchInitialDevices();
        this.setupRealtimeSubscriptions();
        this.setupVoiceControl();
    }

    setupEventListeners() {
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        document.getElementById('closeSettings').addEventListener('click', () => this.closeSettings());
        document.getElementById('cancelSettings').addEventListener('click', () => this.closeSettings());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());

        document.getElementById('voiceBtn').addEventListener('click', () => this.toggleVoiceControl());
        document.getElementById('stopVoiceBtn').addEventListener('click', () => this.stopVoiceControl());

        document.getElementById('settingsModal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) this.closeSettings();
        });
    }

    loadSupabaseConfig() {
        const supabaseUrl = localStorage.getItem('supabaseUrl');
        const supabaseKey = localStorage.getItem('supabaseKey');
        
        if (supabaseUrl && supabaseKey) {
            document.getElementById('supabaseUrl').value = supabaseUrl;
            document.getElementById('supabaseKey').value = supabaseKey;
        }
    }

    async initializeSupabase() {
        const supabaseUrl = localStorage.getItem('supabaseUrl');
        const supabaseKey = localStorage.getItem('supabaseKey');

        if (!supabaseUrl || !supabaseKey) {
            this.updateConnectionStatus('disconnected', 'Please configure Supabase settings');
            return;
        }

        try {
            this.supabase = supabase.createClient(supabaseUrl, supabaseKey);
            this.updateConnectionStatus('connected', 'Connected to Supabase');
            this.showToast('Successfully connected to Supabase!', 'success');
        } catch (error) {
            console.error('Supabase initialization error:', error);
            this.updateConnectionStatus('disconnected', 'Failed to connect to Supabase');
            this.showToast('Failed to connect to Supabase. Check your configuration.', 'error');
        }
    }

    async fetchInitialDevices() {
        if (!this.supabase) return;
        const { data, error } = await this.supabase.from('devices').select('*');
        if (error) {
            console.error('Error fetching devices:', error);
            this.showToast('Could not fetch devices', 'error');
            return;
        }
        this.devices = data;
        this.renderDevices();
    }

    setupRealtimeSubscriptions() {
        if (!this.supabase) return;
        this.supabase
            .channel('public:devices')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'devices' }, payload => {
                console.log('Device state changed:', payload.new);
                this.handleDeviceUpdate(payload.new);
            })
            .subscribe();
    }

    handleDeviceUpdate(updatedDevice) {
        const device = this.devices.find(d => d.id === updatedDevice.id);
        if (device) {
            device.state = updatedDevice.state;
            this.updateDeviceUI(device);
        }
    }

    async toggleDevice(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) return;

        const newState = device.state ? 0 : 1;
        
        const { error } = await this.supabase
            .from('devices')
            .update({ state: newState, updated_at: new Date() })
            .eq('id', deviceId);

        if (error) {
            this.showToast('Failed to update device', 'error');
            return;
        }

        this.showToast(`${device.name} turned ${newState ? 'ON' : 'OFF'}`, 'success');
    }

    async setDeviceState(deviceId, newState) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device || device.state === newState) return; // Do nothing if device not found or state is already correct

        const { error } = await this.supabase
            .from('devices')
            .update({ state: newState, updated_at: new Date() })
            .eq('id', deviceId);

        if (error) {
            this.showToast(`Failed to update ${device.name}`, 'error');
            return;
        }

        // We don't show a toast here to avoid spamming notifications for "all" commands
    }
    
    updateConnectionStatus(status, message) {
        const statusBanner = document.getElementById('statusBanner');
        const statusIcon = document.getElementById('statusIcon');
        const statusText = document.getElementById('statusText');

        statusBanner.className = `status-banner ${status}`;
        statusIcon.textContent = status === 'connected' ? '🟢' : '🔴';
        statusText.textContent = message;
    }
    
    renderDevices() {
        const grid = document.getElementById('deviceGrid');
        grid.innerHTML = '';

        this.devices.forEach(device => {
            const deviceCard = this.createDeviceCard(device);
            grid.appendChild(deviceCard);
        });
    }

    createDeviceCard(device) {
        const card = document.createElement('div');
        card.className = `device-card ${device.state ? 'device-on' : ''}`;
        card.dataset.deviceId = device.id;

        const icons = {
            light: '💡',
            fan: '🌀',
            outlet: '🔌',
        };
        const type = device.name.toLowerCase().includes('light') ? 'light' :
                     device.name.toLowerCase().includes('fan') ? 'fan' : 'outlet';


        card.innerHTML = `
            <div class="device-header">
                <div class="device-info">
                    <h3>${device.name}</h3>
                    <div class="device-gpio">GPIO ${device.gpio}</div>
                </div>
                <div class="device-icon">${icons[type] || '⚡️'}</div>
            </div>
            <div class="device-controls">
                <div class="device-status">${device.state ? 'ON' : 'OFF'}</div>
                <button class="toggle-switch ${device.state ? 'active' : ''}" 
                        onclick="app.toggleDevice(${device.id})"></button>
            </div>
        `;

        return card;
    }
    
    updateDeviceUI(device) {
        const card = document.querySelector(`[data-device-id="${device.id}"]`);
        if (!card) return;

        const toggle = card.querySelector('.toggle-switch');
        const status = card.querySelector('.device-status');

        if (device.state) {
            card.classList.add('device-on');
            toggle.classList.add('active');
            status.textContent = 'ON';
        } else {
            card.classList.remove('device-on');
            toggle.classList.remove('active');
            status.textContent = 'OFF';
        }
    }

    setupVoiceControl() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                const command = event.results[event.results.length - 1][0].transcript.toLowerCase();
                console.log('Voice command:', command);
                this.processVoiceCommand(command);
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                this.showToast('Voice recognition error', 'error');
            };

            this.recognition.onend = () => {
                if (this.isListening) {
                    this.recognition.start(); // Restart if still listening
                }
            };
        } else {
            document.getElementById('voiceBtn').style.display = 'none';
            console.warn('Speech recognition not supported');
        }
    }

    toggleVoiceControl() {
        if (this.isListening) {
            this.stopVoiceControl();
        } else {
            this.startVoiceControl();
        }
    }

    startVoiceControl() {
        if (!this.recognition) return;

        this.isListening = true;
        this.recognition.start();
        document.getElementById('voicePanel').style.display = 'block';
        this.showToast('Voice control activated', 'success');
    }

    stopVoiceControl() {
        if (!this.recognition) return;

        this.isListening = false;
        this.recognition.stop();
        document.getElementById('voicePanel').style.display = 'none';
        this.showToast('Voice control deactivated', 'success');
    }

    async processVoiceCommand(command) {
        try {
            // Use the intelligent NLU system to process the command
            const parsedCommand = this.processIntelligentCommand(command, this.devices);
            
            if (!parsedCommand || !parsedCommand.intent) {
                this.showToast('Could not understand the command. Please try again.', 'error');
                return;
            }

            // Handle the parsed command based on intent
            await this.executeCommand(parsedCommand);
            
        } catch (error) {
            console.error('Voice command processing error:', error);
            this.showToast('Error processing voice command.', 'error');
        }
    }

    /**
     * Intelligent Voice Command Processing System
     * Transforms natural language voice commands into structured actions
     * 
     * @param {string} command - Raw voice command string
     * @param {Array} devices - Array of available device objects
     * @returns {Object} Structured command object with intent, targets, and state
     */
    processIntelligentCommand(command, devices) {
        // Normalize the input command
        const normalizedCommand = this.normalizeCommand(command);
        
        // Tokenize the command
        const tokens = this.tokenizeCommand(normalizedCommand);
        
        // Extract intent from the command
        const intent = this.extractIntent(tokens, normalizedCommand);
        
        if (!intent) {
            return null;
        }
        
        // Extract target devices
        const deviceAnalysis = this.extractTargetDevices(tokens, normalizedCommand, devices);
        
        // Extract desired state (for set_state intents)
        const state = intent === 'set_state' ? this.extractDesiredState(tokens, normalizedCommand) : null;
        
        // Build the structured response
        const result = {
            intent: intent,
            targets: deviceAnalysis.targets,
            original_command: command
        };
        
        if (state !== null) {
            result.state = state;
        }
        
        // Handle ambiguity
        if (deviceAnalysis.ambiguous) {
            result.requires_clarification = true;
            result.clarification_prompt = deviceAnalysis.clarificationPrompt;
        }
        
        return result;
    }

    /**
     * Normalize command by cleaning and standardizing the input
     */
    normalizeCommand(command) {
        return command.toLowerCase()
            .trim()
            .replace(/[^\w\s]/g, ' ') // Remove punctuation
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }

    /**
     * Tokenize command into individual words and phrases
     */
    tokenizeCommand(command) {
        const words = command.split(' ');
        const tokens = {
            words: words,
            bigrams: [],
            trigrams: []
        };
        
        // Generate bigrams (2-word phrases)
        for (let i = 0; i < words.length - 1; i++) {
            tokens.bigrams.push(words[i] + ' ' + words[i + 1]);
        }
        
        // Generate trigrams (3-word phrases)
        for (let i = 0; i < words.length - 2; i++) {
            tokens.trigrams.push(words[i] + ' ' + words[i + 1] + ' ' + words[i + 2]);
        }
        
        return tokens;
    }

    /**
     * Extract intent from the command using pattern matching
     */
    extractIntent(tokens, command) {
        const intentPatterns = {
            set_state: [
                // Turn on/off patterns
                /\b(turn|switch|set)\s+(on|off)\b/,
                /\b(activate|deactivate|enable|disable)\b/,
                /\b(open|close|start|stop|shut)\b/,
                /\b(power\s+(on|off))\b/,
                
                // Direct state commands
                /\b(on|off)\b/,
                
                // Action verbs
                /\b(toggle|flip|switch)\b/
            ],
            query_state: [
                /\b(is|are)\s+.*\s+(on|off|running|active)\b/,
                /\b(what\s+is|whats)\s+.*\s+state\b/,
                /\b(status|state)\s+of\b/,
                /\b(check|show|tell\s+me)\b/
            ]
        };
        
        // Check for query patterns first (more specific)
        for (const pattern of intentPatterns.query_state) {
            if (pattern.test(command)) {
                return 'query_state';
            }
        }
        
        // Check for set_state patterns
        for (const pattern of intentPatterns.set_state) {
            if (pattern.test(command)) {
                return 'set_state';
            }
        }
        
        return null;
    }

    /**
     * Extract target devices from the command
     */
    extractTargetDevices(tokens, command, devices) {
        // Device synonyms mapping
        const deviceSynonyms = {
            light: ['light', 'lamp', 'bulb', 'lighting'],
            fan: ['fan', 'ventilator', 'blower'],
            outlet: ['outlet', 'socket', 'plug', 'power point']
        };
        
        // Location synonyms
        const locationSynonyms = {
            'living room': ['living room', 'living', 'lounge', 'front room'],
            'kitchen': ['kitchen', 'cook'],
            'bedroom': ['bedroom', 'bed room', 'room'],
            'garden': ['garden', 'yard', 'outdoor', 'outside']
        };
        
        let matchedDevices = [];
        let isAmbiguous = false;
        let clarificationPrompt = null;
        
        // Check for "all" commands
        if (this.containsAllKeyword(command)) {
            const deviceType = this.extractDeviceTypeFromAll(command, deviceSynonyms);
            if (deviceType) {
                matchedDevices = devices.filter(device => 
                    this.deviceMatchesType(device.name, deviceType, deviceSynonyms)
                );
            } else {
                matchedDevices = ['all'];
            }
            
            return {
                targets: Array.isArray(matchedDevices) && matchedDevices[0] === 'all' ? ['all'] : 
                         matchedDevices.length > 0 ? matchedDevices.map(d => d.name) : [],
                ambiguous: false
            };
        }
        
        // Score each device for relevance
        const deviceScores = devices.map(device => ({
            device: device,
            score: this.calculateDeviceRelevanceScore(device, command, tokens, deviceSynonyms, locationSynonyms)
        }));
        
        // Filter devices with positive scores
        const relevantDevices = deviceScores.filter(ds => ds.score > 0);
        
        if (relevantDevices.length === 0) {
            return { targets: [], ambiguous: false };
        }
        
        // Sort by score (highest first)
        relevantDevices.sort((a, b) => b.score - a.score);
        
        // Check for ambiguity
        const topScore = relevantDevices[0].score;
        const topDevices = relevantDevices.filter(ds => ds.score === topScore);
        
        if (topDevices.length > 1 && topScore < 100) { // 100 is exact match score
            isAmbiguous = true;
            const deviceNames = topDevices.map(ds => ds.device.name);
            clarificationPrompt = `Which device did you mean? ${this.formatDeviceList(deviceNames)}`;
            matchedDevices = topDevices.map(ds => ds.device);
        } else {
            matchedDevices = [relevantDevices[0].device];
        }
        
        return {
            targets: matchedDevices.map(d => d.name),
            ambiguous: isAmbiguous,
            clarificationPrompt: clarificationPrompt
        };
    }

    /**
     * Calculate relevance score for a device based on the command
     */
    calculateDeviceRelevanceScore(device, command, tokens, deviceSynonyms, locationSynonyms) {
        let score = 0;
        const deviceName = device.name.toLowerCase();
        const deviceWords = deviceName.split(' ');
        
        // Exact device name match (highest score)
        if (command.includes(deviceName)) {
            return 100;
        }
        
        // Check each word in the device name
        for (const word of deviceWords) {
            if (command.includes(word)) {
                score += 30;
            }
        }
        
        // Check device type synonyms
        for (const [type, synonyms] of Object.entries(deviceSynonyms)) {
            if (this.deviceMatchesType(deviceName, type, deviceSynonyms)) {
                for (const synonym of synonyms) {
                    if (command.includes(synonym)) {
                        score += 25;
                        break;
                    }
                }
            }
        }
        
        // Check location matching
        for (const [location, synonyms] of Object.entries(locationSynonyms)) {
            if (deviceName.includes(location)) {
                for (const synonym of synonyms) {
                    if (command.includes(synonym)) {
                        score += 40;
                        break;
                    }
                }
            }
        }
        
        return score;
    }

    /**
     * Extract desired state from the command
     */
    extractDesiredState(tokens, command) {
        // State patterns
        const onPatterns = [
            /\b(turn|switch|set)\s+on\b/,
            /\bon\b/,
            /\b(activate|enable|start|open)\b/
        ];
        
        const offPatterns = [
            /\b(turn|switch|set)\s+off\b/,
            /\boff\b/,
            /\b(deactivate|disable|stop|close|shut)\b/
        ];
        
        // Check for ON state
        for (const pattern of onPatterns) {
            if (pattern.test(command)) {
                return 'ON';
            }
        }
        
        // Check for OFF state
        for (const pattern of offPatterns) {
            if (pattern.test(command)) {
                return 'OFF';
            }
        }
        
        return null;
    }

    /**
     * Helper methods
     */
    containsAllKeyword(command) {
        return /\b(all|every|everything)\b/.test(command);
    }

    extractDeviceTypeFromAll(command, deviceSynonyms) {
        for (const [type, synonyms] of Object.entries(deviceSynonyms)) {
            for (const synonym of synonyms) {
                if (command.includes(synonym)) {
                    return type;
                }
            }
        }
        return null;
    }

    deviceMatchesType(deviceName, type, deviceSynonyms) {
        const synonyms = deviceSynonyms[type] || [];
        return synonyms.some(synonym => deviceName.includes(synonym));
    }

    formatDeviceList(deviceNames) {
        if (deviceNames.length === 2) {
            return `${deviceNames[0]} or ${deviceNames[1]}?`;
        }
        return `${deviceNames.slice(0, -1).join(', ')}, or ${deviceNames[deviceNames.length - 1]}?`;
    }

    /**
     * Execute the parsed command
     */
    async executeCommand(parsedCommand) {
        const { intent, targets, state, requires_clarification, clarification_prompt } = parsedCommand;
        
        if (requires_clarification) {
            this.showToast(clarification_prompt, 'warning');
            return;
        }
        
        if (intent === 'query_state') {
            this.handleStateQuery(targets);
            return;
        }
        
        if (intent === 'set_state') {
            if (!state) {
                this.showToast('Could not determine the desired state.', 'error');
                return;
            }
            
            await this.handleSetState(targets, state);
        }
    }

    /**
     * Handle state query commands
     */
    handleStateQuery(targets) {
        if (targets.length === 0) {
            this.showToast('No devices found to query.', 'error');
            return;
        }
        
        const targetDevices = targets.map(name => 
            this.devices.find(d => d.name === name)
        ).filter(d => d);
        
        if (targetDevices.length === 1) {
            const device = targetDevices[0];
            const status = device.state ? 'ON' : 'OFF';
            this.showToast(`${device.name} is currently ${status}`, 'info');
        } else {
            const statuses = targetDevices.map(d => 
                `${d.name}: ${d.state ? 'ON' : 'OFF'}`
            ).join(', ');
            this.showToast(`Device statuses: ${statuses}`, 'info');
        }
    }

    /**
     * Handle set state commands
     */
    async handleSetState(targets, state) {
        if (targets.length === 0) {
            this.showToast('No devices found to control.', 'error');
            return;
        }
        
        const stateValue = state === 'ON' ? 1 : 0;
        
        // Handle "all" devices
        if (targets.includes('all')) {
            await Promise.all(this.devices.map(device => 
                this.setDeviceState(device.id, stateValue)
            ));
            this.showToast(`Turned ${state} all devices.`, 'success');
            return;
        }
        
        // Handle specific devices
        const targetDevices = targets.map(name => 
            this.devices.find(d => d.name === name)
        ).filter(d => d);
        
        if (targetDevices.length === 0) {
            this.showToast('Device not found.', 'error');
            return;
        }
        
        await Promise.all(targetDevices.map(device => 
            this.setDeviceState(device.id, stateValue)
        ));
        
        if (targetDevices.length === 1) {
            this.showToast(`${targetDevices[0].name} turned ${state}`, 'success');
        } else {
            const deviceNames = targetDevices.map(d => d.name).join(', ');
            this.showToast(`Turned ${state}: ${deviceNames}`, 'success');
        }
    }

    openSettings() {
        document.getElementById('settingsModal').classList.add('active');
    }

    closeSettings() {
        document.getElementById('settingsModal').classList.remove('active');
    }

    saveSettings() {
        const supabaseUrl = document.getElementById('supabaseUrl').value.trim();
        const supabaseKey = document.getElementById('supabaseKey').value.trim();

        if (!supabaseUrl || !supabaseKey) {
            this.showToast('Please fill in all Supabase fields', 'error');
            return;
        }

        localStorage.setItem('supabaseUrl', supabaseUrl);
        localStorage.setItem('supabaseKey', supabaseKey);

        this.closeSettings();
        this.showToast('Settings saved! Reconnecting...', 'success');
        
        setTimeout(() => {
            this.initializeSupabase();
        }, 1000);
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new HomeAutomationApp();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration.scope);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    });
}