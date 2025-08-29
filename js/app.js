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
                <div class="device-icon">${icons[type] || '⚡'}</div>
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
        let action = null;
        if (command.includes('turn on') || command.includes('switch on')) {
            action = 1;
        } else if (command.includes('turn off') || command.includes('switch off')) {
            action = 0;
        }

        if (action === null) return;
        
        const device = this.devices.find(d => command.includes(d.name.toLowerCase()));
        
        if (device) {
            await this.toggleDevice(device.id);
        } else {
            this.showToast('Device not found', 'error');
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