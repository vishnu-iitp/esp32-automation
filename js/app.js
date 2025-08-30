class HomeAutomationApp {
    constructor() {
        this.supabase = null;
        this.devices = [];
        this.user = null;
        this.isListening = false;
        this.recognition = null;
        this.isProcessingVoiceCommand = false;
        this.realtimeChannel = null; // Track the realtime channel for cleanup
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.loadSupabaseConfig();
        await this.initializeSupabase();
        await this.checkAuthState();
        this.setupVoiceControl();
    }

    setupEventListeners() {
        // Authentication event listeners
        this.setupAuthEventListeners();
        
        // Modal event listeners
        this.setupModalEventListeners();
        
        // Voice control event listeners
        this.setupVoiceEventListeners();
        
        // Device management event listeners
        this.setupDeviceEventListeners();
        
        // Keyboard event listeners
        this.setupKeyboardEventListeners();
    }

    setupAuthEventListeners() {
        document.getElementById('showSignUpForm').addEventListener('click', (e) => {
            e.preventDefault();
            this.showSignUpForm();
        });
        document.getElementById('showSignInForm').addEventListener('click', (e) => {
            e.preventDefault();
            this.showSignInForm();
        });
        document.getElementById('signInBtn').addEventListener('click', () => this.signIn());
        document.getElementById('signUpBtn').addEventListener('click', () => this.signUp());
        document.getElementById('logoutBtn').addEventListener('click', () => this.signOut());
    }

    setupModalEventListeners() {
        // Claim Device Modal
        document.getElementById('claimDeviceBtn').addEventListener('click', () => this.openClaimDeviceModal());
        document.getElementById('closeClaimDevice').addEventListener('click', () => this.closeClaimDeviceModal());
        document.getElementById('cancelClaimDevice').addEventListener('click', () => this.closeClaimDeviceModal());
        document.getElementById('saveClaimDevice').addEventListener('click', () => this.claimDevice());

        // Settings Modal
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        document.getElementById('closeSettings').addEventListener('click', () => this.closeSettings());
        document.getElementById('cancelSettings').addEventListener('click', () => this.closeSettings());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());

        // Add Device Modal
        document.getElementById('addDeviceBtn').addEventListener('click', () => this.openAddDeviceModal());
        document.getElementById('closeAddDevice').addEventListener('click', () => this.closeAddDeviceModal());
        document.getElementById('cancelAddDevice').addEventListener('click', () => this.closeAddDeviceModal());
        document.getElementById('saveAddDevice').addEventListener('click', () => this.addDevice());

        // Modal overlay listeners for closing
        this.setupModalEventListeners('settingsModal', () => this.closeSettings());
        this.setupModalEventListeners('addDeviceModal', () => this.closeAddDeviceModal());
        this.setupModalEventListeners('claimDeviceModal', () => this.closeClaimDeviceModal());
    }

    setupVoiceEventListeners() {
        document.getElementById('voiceBtn').addEventListener('click', () => this.toggleVoiceControl());
        document.getElementById('stopVoiceBtn').addEventListener('click', () => this.stopVoiceControl());
    }

    setupDeviceEventListeners() {
        // Rename Device Modal Event Listeners
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('edit-device-btn')) {
                const deviceId = e.target.closest('.device-card').dataset.deviceId;
                this.openRenameDeviceModal(deviceId);
            }
        });
    }

    setupKeyboardEventListeners() {
        // Enter key listeners for forms
        document.getElementById('loginPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.signIn();
        });
        document.getElementById('signupUsername').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.signUp();
        });
        document.getElementById('deviceMacAddress').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.claimDevice();
        });
        
        // Add event listener for new device MAC address field
        document.addEventListener('DOMContentLoaded', () => {
            const newDeviceMacField = document.getElementById('newDeviceMacAddress');
            if (newDeviceMacField) {
                newDeviceMacField.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.addDevice();
                });
            }
        });
    }

    showSignUpForm() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('signupForm').style.display = 'block';
    }

    showSignInForm() {
        document.getElementById('signupForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
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
            this.updateConnectionStatus('disconnected', 'Please configure Supabase settings first');
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

    async checkAuthState() {
        if (!this.supabase) return;

        const { data: { session } } = await this.supabase.auth.getSession();
        
        if (session?.user) {
            this.user = session.user;
            await this.onUserSignedIn();
        } else {
            this.onUserSignedOut();
        }

        // Listen for auth changes
        this.supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                this.user = session.user;
                await this.onUserSignedIn();
            } else {
                this.user = null;
                this.onUserSignedOut();
            }
        });
    }

    async onUserSignedIn() {
        // Show main app, hide auth
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('mainAppSection').style.display = 'block';
        
        // Update user info
        document.getElementById('userEmail').textContent = this.user.email;
        
        // Fetch user's devices and setup real-time subscriptions
        await this.fetchUserDevices();
        this.setupRealtimeSubscriptions();
        
        this.showToast(`Welcome back, ${this.user.email}!`, 'success');
    }

    onUserSignedOut() {
        // Show auth, hide main app
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('mainAppSection').style.display = 'none';
        
        // Clean up realtime subscription
        if (this.realtimeChannel) {
            this.realtimeChannel.unsubscribe();
            this.realtimeChannel = null;
        }
        
        // Clear devices
        this.devices = [];
        this.renderDevices();
        
        // Clear form fields
        this.clearAuthForms();
    }

    clearAuthForms() {
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        document.getElementById('signupEmail').value = '';
        document.getElementById('signupPassword').value = '';
        document.getElementById('signupUsername').value = '';
    }

    async signUp() {
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value;
        const username = document.getElementById('signupUsername').value.trim();

        if (!this.validateForm([
            { value: email, name: 'email' },
            { value: password, name: 'password' },
            { value: username, name: 'username' }
        ])) {
            return;
        }

        if (password.length < 6) {
            this.showToast('Password must be at least 6 characters', 'error');
            return;
        }

        try {
            await this.updateButtonState('signUpBtn', true, 'Create Account', 'Creating Account...');

            const { data, error } = await this.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        username: username
                    }
                }
            });

            if (error) throw error;

            this.showToast('Account created! Please check your email to verify your account.', 'success');
            this.showSignInForm();

        } catch (error) {
            console.error('Sign up error:', error);
            this.showToast(error.message || 'Failed to create account', 'error');
        } finally {
            await this.updateButtonState('signUpBtn', false, 'Create Account', 'Creating Account...');
        }
    }

    async signIn() {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!this.validateForm([
            { value: email, name: 'email' },
            { value: password, name: 'password' }
        ])) {
            return;
        }

        try {
            await this.updateButtonState('signInBtn', true, 'Sign In', 'Signing In...');

            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

        } catch (error) {
            console.error('Sign in error:', error);
            this.showToast(error.message || 'Failed to sign in', 'error');
        } finally {
            await this.updateButtonState('signInBtn', false, 'Sign In', 'Signing In...');
        }
    }

    async signOut() {
        try {
            const { error } = await this.supabase.auth.signOut();
            if (error) throw error;
            
        } catch (error) {
            console.error('Sign out error:', error);
            this.showToast('Failed to sign out', 'error');
        }
    }

    async fetchUserDevices() {
        if (!this.supabase || !this.user) return;
        
        try {
            const { data, error } = await this.supabase
                .from('devices')
                .select('*')
                .eq('user_id', this.user.id)
                .order('created_at', { ascending: true });
            
            if (error) {
                console.error('Error fetching devices:', error);
                this.showToast('Could not fetch devices', 'error');
                return;
            }
            
            this.devices = data || [];
            this.renderDevices();
            
            if (this.devices.length === 0) {
                this.showToast('No devices found. Add a device or claim an existing one.', 'info');
            }
        } catch (error) {
            console.error('Unexpected error fetching devices:', error);
            this.showToast('Failed to load devices. Please refresh the page.', 'error');
        }
    }

    setupRealtimeSubscriptions() {
        if (!this.supabase || !this.user) return;
        
        // Clean up existing subscription if any
        if (this.realtimeChannel) {
            this.realtimeChannel.unsubscribe();
        }
        
        this.realtimeChannel = this.supabase
            .channel('user-devices')
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'devices',
                filter: `user_id=eq.${this.user.id}`
            }, payload => {
                console.log('Device state changed:', payload.new);
                this.handleDeviceUpdate(payload.new);
            })
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'devices',
                filter: `user_id=eq.${this.user.id}`
            }, payload => {
                console.log('New device added:', payload.new);
                this.handleDeviceInsert(payload.new);
            })
            .on('postgres_changes', { 
                event: 'DELETE', 
                schema: 'public', 
                table: 'devices',
                filter: `user_id=eq.${this.user.id}`
            }, payload => {
                console.log('Device deleted:', payload.old);
                this.handleDeviceDelete(payload.old);
            })
            .subscribe((status) => {
                console.log('Realtime subscription status:', status);
                if (status === 'SUBSCRIBED') {
                    this.showToast('Real-time updates connected', 'success');
                } else if (status === 'CHANNEL_ERROR') {
                    this.showToast('Real-time connection failed', 'error');
                }
            });
    }

    // Device claiming functionality
    openClaimDeviceModal() {
        this.openModal('claimDeviceModal');
        document.getElementById('deviceMacAddress').value = '';
    }

    closeClaimDeviceModal() {
        this.closeModal('claimDeviceModal');
    }

    async claimDevice() {
        const macAddress = document.getElementById('deviceMacAddress').value.trim().toUpperCase();
        
        if (!macAddress) {
            this.showToast('Please enter a MAC address', 'error');
            return;
        }

        if (!this.validateMacAddress(macAddress)) {
            this.showToast('Please enter a valid MAC address (AA:BB:CC:DD:EE:FF)', 'error');
            return;
        }

        try {
            await this.updateButtonState('saveClaimDevice', true, 'Claim Device', 'Claiming...');

            const { data, error } = await this.supabase.functions.invoke('claim-device', {
                body: { mac_address: macAddress }
            });

            if (error) throw error;

            this.closeClaimDeviceModal();
            this.showToast('Device claimed successfully!', 'success');
            await this.fetchUserDevices();

        } catch (error) {
            console.error('Claim device error:', error);
            this.showToast(error.message || 'Failed to claim device. Make sure the MAC address is correct and the device is available.', 'error');
        } finally {
            await this.updateButtonState('saveClaimDevice', false, 'Claim Device', 'Claiming...');
        }
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

    handleDeviceDelete(deletedDevice) {
        // Remove device from local array
        this.devices = this.devices.filter(d => d.id !== deletedDevice.id);
        
        // Remove device card from UI
        const card = document.querySelector(`[data-device-id="${deletedDevice.id}"]`);
        if (card) {
            card.remove();
        }
        
        this.showToast(`Device "${deletedDevice.name}" removed`, 'info');
    }

    async toggleDevice(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) return;

        const newState = device.state ? 0 : 1;
        
        try {
            const { error } = await this.supabase
                .from('devices')
                .update({ 
                    state: newState, 
                    updated_at: new Date().toISOString() 
                })
                .eq('id', deviceId);

            if (error) {
                console.error('Error updating device:', error);
                this.showToast('Failed to update device', 'error');
                return;
            }

            this.showToast(`${device.name} turned ${newState ? 'ON' : 'OFF'}`, 'success');
        } catch (error) {
            console.error('Unexpected error updating device:', error);
            this.showToast('Network error. Please check your connection.', 'error');
        }
    }

    async setDeviceState(deviceId, newState) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device || device.state === newState) return;

        const { error } = await this.supabase
            .from('devices')
            .update({ state: newState, updated_at: new Date() })
            .eq('id', deviceId);

        if (error) {
            this.showToast(`Failed to update ${device.name}`, 'error');
            return;
        }
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
        this.isProcessingVoiceCommand = false;
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

    async setDeviceState(deviceId, newState) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device || device.state === newState) return;

        const { error } = await this.supabase
            .from('devices')
            .update({ state: newState, updated_at: new Date() })
            .eq('id', deviceId);

        if (error) {
            this.showToast(`Failed to update ${device.name}`, 'error');
            return;
        }
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

        const deviceType = this.getDeviceType(device.name);
        const deviceIcon = this.getDeviceIcon(deviceType);

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
                    <div class="device-icon">${deviceIcon}</div>
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

    getDeviceType(deviceName) {
        const name = deviceName.toLowerCase();
        if (name.includes('light')) return 'light';
        if (name.includes('fan')) return 'fan';
        if (name.includes('outlet')) return 'outlet';
        if (name.includes('motor')) return 'motor';
        if (name.includes('heater')) return 'heater';
        if (name.includes('cooler')) return 'cooler';
        return 'outlet';
    }

    getDeviceIcon(type) {
        const icons = {
            light: '💡',
            fan: '🌀',
            outlet: '🔌',
            motor: '⚙️',
            heater: '🔥',
            cooler: '❄️',
        };
        return icons[type] || '⚡️';
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
                    this.recognition.start();
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
        this.isProcessingVoiceCommand = false;
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
            
            // Use the intelligent NLU system to process the command
            const parsedCommand = this.processIntelligentCommand(command, this.devices);
            
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
            
            if (targetDevices.length === 0) {
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

    openSettings() {
        this.openModal('settingsModal');
    }

    closeSettings() {
        this.closeModal('settingsModal');
    }

    saveSettings() {
        const supabaseUrl = document.getElementById('supabaseUrl').value.trim();
        const supabaseKey = document.getElementById('supabaseKey').value.trim();

        if (!this.validateForm([
            { value: supabaseUrl, name: 'Supabase URL' },
            { value: supabaseKey, name: 'Supabase Key' }
        ])) {
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

    // =================== MODAL HELPER METHODS ===================
    
    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }
    
    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }
    
    setupModalEventListeners(modalId, closeCallback) {
        const modal = document.getElementById(modalId);
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                closeCallback();
            }
        });
    }

    async updateButtonState(buttonId, isLoading, originalText, loadingText) {
        const button = document.getElementById(buttonId);
        button.disabled = isLoading;
        button.textContent = isLoading ? loadingText : originalText;
    }

    validateForm(fields) {
        for (const field of fields) {
            if (!field.value || !field.value.trim()) {
                this.showToast(`Please fill in ${field.name}`, 'error');
                return false;
            }
        }
        return true;
    }

    validateMacAddress(macAddress) {
        const macRegex = /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/;
        return macRegex.test(macAddress);
    }

    // =================== DEVICE MANAGEMENT METHODS ===================

    openAddDeviceModal() {
        this.openModal('addDeviceModal');
        // Clear form fields
        document.getElementById('newDeviceName').value = '';
        document.getElementById('newDeviceMacAddress').value = '';
        document.getElementById('newDeviceGpio').value = '';
        document.getElementById('newDeviceType').value = 'light';
    }

    closeAddDeviceModal() {
        this.closeModal('addDeviceModal');
    }

    async addDevice() {
        const name = document.getElementById('newDeviceName').value.trim();
        const macAddress = document.getElementById('newDeviceMacAddress').value.trim().toUpperCase();
        const gpio = parseInt(document.getElementById('newDeviceGpio').value);
        const type = document.getElementById('newDeviceType').value;

        // Validation
        if (!this.validateForm([
            { value: name, name: 'device name' },
            { value: macAddress, name: 'MAC address' }
        ])) {
            return;
        }

        if (!this.validateMacAddress(macAddress)) {
            this.showToast('Please enter a valid MAC address (AA:BB:CC:DD:EE:FF)', 'error');
            return;
        }

        if (!gpio || gpio < 1 || gpio > 39) {
            this.showToast('Please enter a valid GPIO pin (1-39)', 'error');
            return;
        }

        // Check for duplicate GPIO and MAC
        const existingDevice = this.devices.find(d => d.gpio === gpio);
        if (existingDevice) {
            this.showToast(`GPIO ${gpio} is already in use by "${existingDevice.name}"`, 'error');
            return;
        }

        const existingMacDevice = this.devices.find(d => d.mac_address === macAddress);
        if (existingMacDevice) {
            this.showToast(`MAC address ${macAddress} is already in use by "${existingMacDevice.name}"`, 'error');
            return;
        }

        try {
            await this.updateButtonState('saveAddDevice', true, 'Add Device', 'Adding Device...');

            const { data, error } = await this.supabase
                .from('devices')
                .insert([{
                    name: name,
                    mac_address: macAddress,
                    gpio: gpio,
                    state: 0,
                    device_type: type,
                    user_id: this.user.id,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }])
                .select();

            if (error) throw error;

            // Clean up unclaimed_devices table if this MAC was there
            await this.supabase
                .from('unclaimed_devices')
                .delete()
                .eq('mac_address', macAddress);

            this.closeAddDeviceModal();
            this.showToast(`Device "${name}" added successfully!`, 'success');

        } catch (error) {
            console.error('Error adding device:', error);
            this.showToast('Failed to add device. Please check your connection.', 'error');
        } finally {
            await this.updateButtonState('saveAddDevice', false, 'Add Device', 'Adding Device...');
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
        this.closeModal('renameDeviceModal');
    }

    async renameDevice() {
        const modal = document.getElementById('renameDeviceModal');
        const deviceId = parseInt(modal.dataset.deviceId);
        const newName = document.getElementById('renameDeviceName').value.trim();

        if (!this.validateForm([{ value: newName, name: 'device name' }])) {
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

            if (error) throw error;

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