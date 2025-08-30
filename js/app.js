// Supabase Configuration
const SUPABASE_URL = 'https://ahmseisassvgxbbccqyd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFobXNlaXNhc3N2Z3hiYmNjcXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzOTgyNDEsImV4cCI6MjA3MTk3NDI0MX0.VR3dkEUvDzkH8s9YXQq3E3XCRSu62ldE1Qs9-DI1CaI';

class HomeAutomationApp {
    constructor() {
        this.supabase = null;
        this.devices = [];
        this.isListening = false;
        this.recognition = null;
        this.isProcessingVoiceCommand = false;
        this.deferredPrompt = null; // For PWA installation
        this.currentUser = null;
        this.hasShownWelcome = false;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.initializeSupabase();
        this.setupVoiceControl();
        this.setupPWAInstallation(); // Add PWA setup
        this.handleURLParameters(); // Handle app shortcuts
        this.handleOnlineStatus(); // Setup offline/online handling
        
        // Initialize authentication state management
        await this.handleAuthStateChange();
    }

    setupEventListeners() {
        // Authentication event listeners
        document.getElementById('login-btn').addEventListener('click', () => this.handleLogin());
        document.getElementById('signup-btn').addEventListener('click', () => this.handleSignUp());
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());
        document.getElementById('show-signup').addEventListener('click', (e) => {
            e.preventDefault();
            this.showSignUpForm();
        });
        document.getElementById('show-login').addEventListener('click', (e) => {
            e.preventDefault();
            this.showLoginForm();
        });

        // Handle Enter key for login form
        document.getElementById('login-email').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });
        document.getElementById('login-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });

        // Handle Enter key for signup form
        document.getElementById('signup-confirm').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSignUp();
        });

        // Voice control event listeners
        document.getElementById('voiceBtn').addEventListener('click', () => this.toggleVoiceControl());
        document.getElementById('stopVoiceBtn').addEventListener('click', () => this.stopVoiceControl());

        // Claim Device Modal Event Listeners
        document.getElementById('addDeviceBtn').addEventListener('click', () => this.openClaimDeviceModal());
        document.getElementById('closeClaimDevice').addEventListener('click', () => this.closeClaimDeviceModal());
        document.getElementById('cancelClaimDevice').addEventListener('click', () => this.closeClaimDeviceModal());

        // Rename Device Modal Event Listeners (will be added when modal is created)
        document.addEventListener('click', (e) => {
            // Check for edit button click (button or its child elements)
            const editBtn = e.target.closest('.edit-device-btn');
            if (editBtn) {
                const deviceId = editBtn.closest('.device-card').dataset.deviceId;
                this.openRenameDeviceModal(deviceId);
            }
            
            // Check for delete button click (button or its child elements)
            const deleteBtn = e.target.closest('.delete-device-btn');
            if (deleteBtn) {
                const deviceId = deleteBtn.closest('.device-card').dataset.deviceId;
                this.confirmDeleteDevice(deviceId);
            }
        });

        document.getElementById('claimDeviceModal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) this.closeClaimDeviceModal();
        });
    }

    async initializeSupabase() {
        try {
            this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            this.updateConnectionStatus('connected', 'Connected to Supabase');
            console.log('Supabase initialized successfully');
        } catch (error) {
            console.error('Supabase initialization error:', error);
            this.updateConnectionStatus('disconnected', 'Failed to connect to Supabase');
            this.showToast('Failed to connect to Supabase. Please try again.', 'error');
        }
    }

    async fetchInitialDevices() {
        if (!this.supabase || !this.currentUser) return;
        const { data, error } = await this.supabase
            .from('devices')
            .select('*')
            .eq('user_id', this.currentUser.id);
        if (error) {
            console.error('Error fetching devices:', error);
            this.showToast('Could not fetch devices', 'error');
            return;
        }
        this.devices = data || [];
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
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'devices' }, payload => {
                console.log('New device added:', payload.new);
                this.handleDeviceInsert(payload.new);
            })
            .subscribe();
    }

    handleDeviceUpdate(updatedDevice) {
        const device = this.devices.find(d => d.id === updatedDevice.id);
        if (device) {
            // Update device properties
            Object.assign(device, updatedDevice);
            this.updateDeviceUI(device);
            
            // Stop voice listening if a voice command was being processed
            if (this.isProcessingVoiceCommand && this.isListening) {
                this.stopVoiceControlAfterCommand();
            }
        }
    }

    handleDeviceInsert(newDevice) {
        // Add new device to local array
        this.devices.push(newDevice);
        
        // Add device card to UI
        const grid = document.getElementById('deviceGrid');
        const deviceCard = this.createDeviceCard(newDevice);
        grid.appendChild(deviceCard);
        
        this.showToast(`New device "${newDevice.name}" added successfully!`, 'success');
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
        
        // Don't stop voice control for manual toggles, only for voice commands
        // The isProcessingVoiceCommand flag will be false for manual toggles
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
            motor: '⚙️',
            heater: '🔥',
            cooler: '❄️',
        };
        const type = device.name.toLowerCase().includes('light') ? 'light' :
                     device.name.toLowerCase().includes('fan') ? 'fan' : 
                     device.name.toLowerCase().includes('outlet') ? 'outlet' :
                     device.name.toLowerCase().includes('motor') ? 'motor' :
                     device.name.toLowerCase().includes('heater') ? 'heater' :
                     device.name.toLowerCase().includes('cooler') ? 'cooler' : 'outlet';


        card.innerHTML = `
            <div class="device-header">
                <div class="device-info">
                    <h3 class="device-name">${device.name}</h3>
                    <div class="device-gpio">GPIO ${device.gpio}</div>
                </div>
                <div class="device-actions">
                    <button class="edit-device-btn" title="Rename Device">
                        <span class="edit-icon">✏️</span>
                    </button>
                    <button class="delete-device-btn" title="Delete Device">
                        <span class="delete-icon">🗑️</span>
                    </button>
                    <div class="device-icon">${icons[type] || '⚡️'}</div>
                </div>
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
        this.isProcessingVoiceCommand = false; // Reset processing flag when starting
        this.recognition.start();
        document.getElementById('voicePanel').style.display = 'block';
        this.showToast('Voice control activated', 'success');
    }

    stopVoiceControl() {
        if (!this.recognition) return;

        this.isListening = false;
        this.isProcessingVoiceCommand = false;
        this.recognition.stop();
        document.getElementById('voicePanel').style.display = 'none';
        this.showToast('Voice control deactivated', 'success');
    }

    stopVoiceControlAfterCommand() {
        if (!this.recognition) return;

        this.isListening = false;
        this.isProcessingVoiceCommand = false;
        this.recognition.stop();
        document.getElementById('voicePanel').style.display = 'none';
        this.showToast('Voice command executed. Tap voice button to give another command.', 'info');
    }

    async processVoiceCommand(command) {
        try {
            // Set flag to indicate we're processing a voice command
            this.isProcessingVoiceCommand = true;
            
            console.log('Processing voice command:', command);
            console.log('Available devices:', this.devices.map(d => d.name));
            
            // Use the intelligent NLU system to process the command
            const parsedCommand = this.processIntelligentCommand(command, this.devices);
            
            console.log('Parsed command:', parsedCommand);
            
            if (!parsedCommand || !parsedCommand.intent) {
                this.showToast('Could not understand the command. Please try again.', 'error');
                this.isProcessingVoiceCommand = false;
                return;
            }

            // Handle the parsed command based on intent
            await this.executeCommand(parsedCommand);
            
            // Reset the flag after a delay if no device state change occurred
            // This handles cases where the command doesn't result in a device state change
            setTimeout(() => {
                if (this.isProcessingVoiceCommand) {
                    this.isProcessingVoiceCommand = false;
                }
            }, 3000); // 3 second timeout
            
        } catch (error) {
            console.error('Voice command processing error:', error);
            this.showToast('Error processing voice command.', 'error');
            this.isProcessingVoiceCommand = false;
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
        
        // First, try exact device name matches (case-insensitive)
        const exactMatches = devices.filter(device => {
            const deviceName = device.name.toLowerCase();
            const isMatch = command.includes(deviceName);
            console.log(`Checking exact match for "${device.name}" (${deviceName}) in "${command}": ${isMatch}`);
            return isMatch;
        });
        
        console.log(`Found ${exactMatches.length} exact matches:`, exactMatches.map(d => d.name));
        
        if (exactMatches.length === 1) {
            return {
                targets: [exactMatches[0].name],
                ambiguous: false
            };
        } else if (exactMatches.length > 1) {
            // Multiple exact matches, return all of them
            return {
                targets: exactMatches.map(d => d.name),
                ambiguous: false
            };
        }
        
        // If no exact matches, try partial matching and scoring
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
        
        // Check for exact word matches in device name
        const commandWords = command.split(' ');
        for (const deviceWord of deviceWords) {
            if (commandWords.includes(deviceWord)) {
                score += 50; // High score for exact word match
            }
        }
        
        // Check for partial matches within words (e.g., "light" in "light2")
        for (const deviceWord of deviceWords) {
            for (const commandWord of commandWords) {
                if (deviceWord.includes(commandWord) || commandWord.includes(deviceWord)) {
                    if (deviceWord !== commandWord) { // Avoid double scoring exact matches
                        score += 30; // Good score for partial match
                    }
                }
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
            this.isProcessingVoiceCommand = false;
            return;
        }
        
        if (intent === 'query_state') {
            this.handleStateQuery(targets);
            return;
        }
        
        if (intent === 'set_state') {
            if (!state) {
                this.showToast('Could not determine the desired state.', 'error');
                this.isProcessingVoiceCommand = false;
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
            this.isProcessingVoiceCommand = false;
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
        
        // Reset processing flag for query commands since they don't change device state
        this.isProcessingVoiceCommand = false;
    }

    /**
     * Handle set state commands
     */
    async handleSetState(targets, state) {
        if (targets.length === 0) {
            this.showToast('No devices found to control.', 'error');
            this.isProcessingVoiceCommand = false;
            return;
        }
        
        const stateValue = state === 'ON' ? 1 : 0;
        
        try {
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
            
            console.log('Target device names:', targets);
            console.log('Found target devices:', targetDevices.map(d => d ? d.name : 'NOT FOUND'));
            
            if (targetDevices.length === 0) {
                console.log('No devices found for targets:', targets);
                this.showToast('Device not found.', 'error');
                this.isProcessingVoiceCommand = false;
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
        } catch (error) {
            console.error('Error in handleSetState:', error);
            this.showToast('Failed to execute command.', 'error');
            this.isProcessingVoiceCommand = false;
        }
    }

    // =================== AUTHENTICATION METHODS ===================

    async handleAuthStateChange() {
        // Set up the auth state change listener
        this.supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event, session);
            this.handleAuthSession(session);
        });

        // Check initial session
        const { data: { session } } = await this.supabase.auth.getSession();
        this.handleAuthSession(session);
    }

    handleAuthSession(session) {
        if (session) {
            // User is logged in
            this.currentUser = session.user;
            this.showMainApp();
            this.fetchInitialDevices();
            this.setupRealtimeSubscriptions();
            
            // Only show welcome message for new logins, not initial page loads
            if (session.user && !this.hasShownWelcome) {
                this.showToast(`Welcome, ${session.user.email}!`, 'success');
                this.hasShownWelcome = true;
            }
        } else {
            // User is not logged in
            this.currentUser = null;
            this.showAuthContainer();
            this.devices = [];
            this.renderDevices();
            this.hasShownWelcome = false;
        }
    }

    showMainApp() {
        document.getElementById('auth-container').classList.add('hidden');
        document.querySelector('.container').classList.remove('hidden');
        document.getElementById('logoutBtn').style.display = 'flex';
    }

    showAuthContainer() {
        document.getElementById('auth-container').classList.remove('hidden');
        document.querySelector('.container').classList.add('hidden');
        document.getElementById('logoutBtn').style.display = 'none';
    }

    showSignUpForm() {
        document.getElementById('login-form').classList.remove('active');
        document.getElementById('signup-form').classList.add('active');
    }

    showLoginForm() {
        document.getElementById('signup-form').classList.remove('active');
        document.getElementById('login-form').classList.add('active');
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const loginBtn = document.getElementById('login-btn');

        if (!email || !password) {
            this.showToast('Please fill in all fields', 'error');
            return;
        }

        // Show loading state
        const originalText = loginBtn.textContent;
        loginBtn.textContent = 'Signing In...';
        loginBtn.disabled = true;

        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                throw error;
            }

            // Clear form
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
            this.hasShownWelcome = true; // Mark that we should show welcome message
        } catch (error) {
            console.error('Login error:', error);
            let errorMessage = 'Login failed';
            
            if (error.message.includes('Invalid login credentials')) {
                errorMessage = 'Invalid email or password';
            } else if (error.message.includes('Email not confirmed')) {
                errorMessage = 'Please check your email and confirm your account';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            this.showToast(errorMessage, 'error');
        } finally {
            // Reset button state
            loginBtn.textContent = originalText;
            loginBtn.disabled = false;
        }
    }

    async handleSignUp() {
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm').value;
        const signupBtn = document.getElementById('signup-btn');

        if (!email || !password || !confirmPassword) {
            this.showToast('Please fill in all fields', 'error');
            return;
        }

        if (password !== confirmPassword) {
            this.showToast('Passwords do not match', 'error');
            return;
        }

        if (password.length < 6) {
            this.showToast('Password must be at least 6 characters', 'error');
            return;
        }

        // Show loading state
        const originalText = signupBtn.textContent;
        signupBtn.textContent = 'Creating Account...';
        signupBtn.disabled = true;

        try {
            const { data, error } = await this.supabase.auth.signUp({
                email: email,
                password: password
            });

            if (error) {
                throw error;
            }

            // Clear form and switch to login
            document.getElementById('signup-email').value = '';
            document.getElementById('signup-password').value = '';
            document.getElementById('signup-confirm').value = '';
            
            if (data.user && !data.session) {
                this.showToast('Account created! Please check your email for verification.', 'success');
                this.showLoginForm();
            } else {
                this.showToast('Account created successfully!', 'success');
            }
        } catch (error) {
            console.error('Sign up error:', error);
            let errorMessage = 'Sign up failed';
            
            if (error.message.includes('already registered')) {
                errorMessage = 'An account with this email already exists';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            this.showToast(errorMessage, 'error');
        } finally {
            // Reset button state
            signupBtn.textContent = originalText;
            signupBtn.disabled = false;
        }
    }

    async handleLogout() {
        try {
            const { error } = await this.supabase.auth.signOut();
            
            if (error) {
                throw error;
            }

            this.showToast('Logged out successfully', 'success');
        } catch (error) {
            console.error('Logout error:', error);
            this.showToast('Logout failed', 'error');
        }
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // =================== DEVICE MANAGEMENT METHODS ===================

    async openClaimDeviceModal() {
        document.getElementById('claimDeviceModal').classList.add('active');
        // Start searching for unclaimed devices
        await this.findUnclaimedDevices();
    }

    closeClaimDeviceModal() {
        document.getElementById('claimDeviceModal').classList.remove('active');
    }

    async findUnclaimedDevices() {
        const spinner = document.getElementById('claim-spinner');
        const devicesList = document.getElementById('unclaimed-devices-list');
        
        // Show spinner and clear previous results
        spinner.style.display = 'block';
        devicesList.innerHTML = '';

        try {
            const { data, error } = await this.supabase
                .from('devices')
                .select('*')
                .is('user_id', null);

            if (error) {
                throw error;
            }

            // Hide spinner
            spinner.style.display = 'none';

            if (data && data.length > 0) {
                this.renderUnclaimedDevicesList(data);
            } else {
                devicesList.innerHTML = '<div class="no-devices-message">No new devices found. Make sure your device is powered on and connected to Wi-Fi.</div>';
            }

        } catch (error) {
            console.error('Error fetching unclaimed devices:', error);
            spinner.style.display = 'none';
            devicesList.innerHTML = '<div class="no-devices-message">Error searching for devices. Please try again.</div>';
            this.showToast('Failed to search for devices', 'error');
        }
    }

    renderUnclaimedDevicesList(devices) {
        const devicesList = document.getElementById('unclaimed-devices-list');
        
        const devicesHTML = devices.map(device => `
            <div class="unclaimed-device-item">
                <span class="unclaimed-device-name">${device.name}</span>
                <button class="claim-btn" data-device-id="${device.id}">
                    <span>🏠</span>
                    Claim
                </button>
            </div>
        `).join('');
        
        devicesList.innerHTML = devicesHTML;
        
        // Add event listeners to claim buttons
        devicesList.querySelectorAll('.claim-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const deviceId = parseInt(e.target.dataset.deviceId || e.target.closest('.claim-btn').dataset.deviceId);
                this.claimDevice(deviceId);
            });
        });
    }

    async claimDevice(deviceId) {
        if (!this.currentUser) {
            this.showToast('You must be logged in to claim devices', 'error');
            return;
        }

        try {
            // Get the current user's session to extract the JWT
            const { data: { session } } = await this.supabase.auth.getSession();
            
            if (!session || !session.access_token) {
                this.showToast('Authentication session expired. Please log in again.', 'error');
                return;
            }

            // Call the Edge Function to claim the device
            const response = await fetch(`${SUPABASE_URL}/functions/v1/create-device-jwt`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    device_id: deviceId
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }

            if (result.success) {
                // The device has been successfully claimed
                // Remove the device from unclaimed list and refresh the UI
                await this.findUnclaimedDevices(); // Refresh the unclaimed devices list
                
                // Refresh the user's device list
                await this.fetchInitialDevices();
                
                // Close the modal and show success message
                this.closeClaimDeviceModal();
                this.showToast(result.message || `Device claimed successfully!`, 'success');
            } else {
                throw new Error(result.error || 'Unknown error occurred');
            }

        } catch (error) {
            console.error('Error claiming device:', error);
            
            let errorMessage = 'Failed to claim device. Please try again.';
            
            // Handle specific error cases
            if (error.message.includes('already claimed')) {
                errorMessage = 'This device has already been claimed by another user.';
            } else if (error.message.includes('not found')) {
                errorMessage = 'Device not found. It may have been removed.';
            } else if (error.message.includes('Unauthorized') || error.message.includes('401')) {
                errorMessage = 'Authentication failed. Please log in again.';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            this.showToast(errorMessage, 'error');
        }
    }

    openRenameDeviceModal(deviceId) {
        const device = this.devices.find(d => d.id == deviceId);
        if (!device) return;

        // Create rename modal if it doesn't exist
        this.createRenameModal();

        // Populate form with current device name
        document.getElementById('renameDeviceName').value = device.name;
        document.getElementById('renameDeviceModal').dataset.deviceId = deviceId;
        document.getElementById('renameDeviceModal').classList.add('active');
    }

    createRenameModal() {
        // Check if modal already exists
        if (document.getElementById('renameDeviceModal')) return;

        const modalHTML = `
            <div class="modal-overlay" id="renameDeviceModal">
                <div class="modal">
                    <div class="modal-header">
                        <h2>Rename Device</h2>
                        <button class="modal-close" id="closeRenameDevice">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="renameDeviceName">Device Name</label>
                            <input type="text" id="renameDeviceName" placeholder="Enter new device name">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="cancelRenameDevice">Cancel</button>
                        <button class="btn btn-primary" id="saveRenameDevice">Save Changes</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Add event listeners
        document.getElementById('closeRenameDevice').addEventListener('click', () => this.closeRenameDeviceModal());
        document.getElementById('cancelRenameDevice').addEventListener('click', () => this.closeRenameDeviceModal());
        document.getElementById('saveRenameDevice').addEventListener('click', () => this.renameDevice());
        document.getElementById('renameDeviceModal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) this.closeRenameDeviceModal();
        });
    }

    closeRenameDeviceModal() {
        const modal = document.getElementById('renameDeviceModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async renameDevice() {
        const modal = document.getElementById('renameDeviceModal');
        const deviceId = parseInt(modal.dataset.deviceId);
        const newName = document.getElementById('renameDeviceName').value.trim();

        // Validation
        if (!newName) {
            this.showToast('Please enter a device name', 'error');
            return;
        }

        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            this.showToast('Device not found', 'error');
            return;
        }

        if (device.name === newName) {
            this.closeRenameDeviceModal();
            return; // No change needed
        }

        try {
            const { error } = await this.supabase
                .from('devices')
                .update({ 
                    name: newName,
                    updated_at: new Date().toISOString()
                })
                .eq('id', deviceId);

            if (error) {
                console.error('Error renaming device:', error);
                this.showToast('Failed to rename device. Please try again.', 'error');
                return;
            }

            // Update local device object
            device.name = newName;

            // Update UI
            const card = document.querySelector(`[data-device-id="${deviceId}"]`);
            if (card) {
                const nameElement = card.querySelector('.device-name');
                if (nameElement) {
                    nameElement.textContent = newName;
                }
            }

            this.closeRenameDeviceModal();
            this.showToast(`Device renamed to "${newName}" successfully!`, 'success');

        } catch (error) {
            console.error('Error renaming device:', error);
            this.showToast('Failed to rename device. Please check your connection.', 'error');
        }
    }

    // =================== DELETE DEVICE METHODS ===================

    confirmDeleteDevice(deviceId) {
        const device = this.devices.find(d => d.id == deviceId);
        if (!device) return;

        // Create confirmation modal if it doesn't exist
        this.createDeleteConfirmationModal();

        // Set device info in modal
        document.getElementById('deleteDeviceName').textContent = device.name;
        document.getElementById('deleteConfirmationModal').dataset.deviceId = deviceId;
        document.getElementById('deleteConfirmationModal').classList.add('active');
    }

    createDeleteConfirmationModal() {
        // Check if modal already exists
        if (document.getElementById('deleteConfirmationModal')) return;

        const modalHTML = `
            <div class="modal-overlay" id="deleteConfirmationModal">
                <div class="modal">
                    <div class="modal-header">
                        <h2>Delete Device</h2>
                        <button class="modal-close" id="closeDeleteConfirmation">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="delete-warning">
                            <div class="warning-icon">⚠️</div>
                            <p>Are you sure you want to delete <strong id="deleteDeviceName"></strong>?</p>
                            <p class="warning-text">This action cannot be undone. The device will be permanently removed from your system.</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="cancelDeleteDevice">Cancel</button>
                        <button class="btn btn-danger" id="confirmDeleteDevice">Delete Device</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Add event listeners
        document.getElementById('closeDeleteConfirmation').addEventListener('click', () => this.closeDeleteConfirmationModal());
        document.getElementById('cancelDeleteDevice').addEventListener('click', () => this.closeDeleteConfirmationModal());
        document.getElementById('confirmDeleteDevice').addEventListener('click', () => this.deleteDevice());
        document.getElementById('deleteConfirmationModal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) this.closeDeleteConfirmationModal();
        });
    }

    closeDeleteConfirmationModal() {
        const modal = document.getElementById('deleteConfirmationModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async deleteDevice() {
        const modal = document.getElementById('deleteConfirmationModal');
        const deviceId = parseInt(modal.dataset.deviceId);

        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            this.showToast('Device not found', 'error');
            return;
        }

        try {
            const { error } = await this.supabase
                .from('devices')
                .delete()
                .eq('id', deviceId);

            if (error) {
                console.error('Error deleting device:', error);
                this.showToast('Failed to delete device. Please try again.', 'error');
                return;
            }

            // Remove device from local array
            this.devices = this.devices.filter(d => d.id !== deviceId);

            // Remove device card from UI
            const card = document.querySelector(`[data-device-id="${deviceId}"]`);
            if (card) {
                card.remove();
            }

            this.closeDeleteConfirmationModal();
            this.showToast(`Device "${device.name}" deleted successfully!`, 'success');

        } catch (error) {
            console.error('Error deleting device:', error);
            this.showToast('Failed to delete device. Please check your connection.', 'error');
        }
    }

    // =================== PWA INSTALLATION METHODS ===================

    setupPWAInstallation() {
        // Listen for beforeinstallprompt event
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later
            this.deferredPrompt = e;
            // Show the install button
            this.showInstallButton();
        });

        // Listen for app installed event
        window.addEventListener('appinstalled', () => {
            console.log('PWA was installed');
            this.hideInstallButton();
            this.showToast('App installed successfully!', 'success');
            this.deferredPrompt = null;
        });

        // Check if app is already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            console.log('PWA is running in standalone mode');
            this.hideInstallButton();
        }
    }

    showInstallButton() {
        // Create install button if it doesn't exist
        if (!document.getElementById('installBtn')) {
            const installBtn = document.createElement('button');
            installBtn.id = 'installBtn';
            installBtn.className = 'btn btn-primary install-btn';
            installBtn.innerHTML = `
                <span class="install-icon">📱</span>
                Install App
            `;
            installBtn.addEventListener('click', () => this.installPWA());
            
            // Add to header actions
            const headerActions = document.querySelector('.header-actions');
            headerActions.insertBefore(installBtn, headerActions.firstChild);
        }
    }

    hideInstallButton() {
        const installBtn = document.getElementById('installBtn');
        if (installBtn) {
            installBtn.remove();
        }
    }

    async installPWA() {
        if (!this.deferredPrompt) return;

        // Show the prompt
        this.deferredPrompt.prompt();
        
        // Wait for the user to respond to the prompt
        const { outcome } = await this.deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
        } else {
            console.log('User dismissed the install prompt');
        }
        
        // Clear the deferredPrompt
        this.deferredPrompt = null;
    }

    // =================== URL PARAMETER HANDLING ===================

    handleURLParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const action = urlParams.get('action');

        switch (action) {
            case 'voice':
                // Start voice control if accessed via shortcut
                setTimeout(() => {
                    if (!this.isListening) {
                        this.startVoiceControl();
                    }
                }, 1000);
                break;
            case 'add':
                // Open claim device modal if accessed via shortcut
                setTimeout(() => {
                    this.openClaimDeviceModal();
                }, 500);
                break;
        }

        // Clean up URL after handling
        if (action) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    // =================== OFFLINE SUPPORT ===================

    queueOfflineAction(action) {
        // Store failed actions for retry when back online
        const offlineActions = JSON.parse(localStorage.getItem('offlineActions') || '[]');
        offlineActions.push({
            ...action,
            timestamp: Date.now()
        });
        localStorage.setItem('offlineActions', JSON.stringify(offlineActions));
    }

    handleOnlineStatus() {
        window.addEventListener('online', () => {
            this.showToast('Connection restored!', 'success');
            this.updateConnectionStatus('connected', 'Connected to Supabase');
            // Retry any queued offline actions
            this.retryOfflineActions();
        });

        window.addEventListener('offline', () => {
            this.showToast('You are offline. Changes will be synced when reconnected.', 'info');
            this.updateConnectionStatus('disconnected', 'Offline - Changes will be synced later');
        });
    }

    async retryOfflineActions() {
        const offlineActions = JSON.parse(localStorage.getItem('offlineActions') || '[]');
        
        for (const action of offlineActions) {
            try {
                // Retry the action based on its type
                if (action.type === 'toggleDevice') {
                    await this.toggleDevice(action.deviceId);
                } else if (action.type === 'deleteDevice') {
                    // Handle delete device retry
                }
            } catch (error) {
                console.error('Failed to retry offline action:', error);
            }
        }
        
        // Clear processed actions
        localStorage.setItem('offlineActions', '[]');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new HomeAutomationApp();
});

// Enhanced service worker registration with update handling
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration.scope);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New content available, notify user
                            if (window.app) {
                                window.app.showToast('New app version available! Refresh to update.', 'info');
                            }
                        }
                    });
                });
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
            
        // Listen for service worker messages
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data.type === 'UPDATE_AVAILABLE') {
                if (window.app) {
                    window.app.showToast('App update available! Refresh to get the latest version.', 'info');
                }
            }
        });
    });
}