class HomeAutomationApp {
    constructor() {
        this.supabase = null;
        this.devices = [];
        this.user = null;
        this.isListening = false;
        this.recognition = null;
        this.isProcessingVoiceCommand = false;
        this.realtimeChannel = null; // Track the realtime channel for cleanup
        this.isSignedIn = false; // Track sign-in state to prevent duplicate initialization
        
        // PWA Install properties
        this.deferredPrompt = null;
        
        this.init();
    }

    async init() {
        try {
            this.setupEventListeners();
            this.setupPWAInstall();
            this.loadSupabaseConfig();
            
            // Add mobile-specific initialization
            if (this.isMobileDevice()) {
                console.log('Mobile device detected, applying mobile optimizations');
                await this.initializeMobileOptimizations();
            }
            
            await this.initializeSupabase();
            await this.checkAuthState();
            this.setupVoiceControl();
            this.startSessionMonitoring();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showToast('Failed to initialize app. Please refresh the page.', 'error');
        }
    }

    // Mobile-specific optimizations
    async initializeMobileOptimizations() {
        try {
            // Add touch event optimizations
            document.body.style.touchAction = 'manipulation';
            
            // Prevent zoom on double tap
            document.addEventListener('touchstart', function(event) {
                if (event.touches.length > 1) {
                    event.preventDefault();
                }
            }, { passive: false });

            // Add viewport meta tag if not present
            if (!document.querySelector('meta[name="viewport"]')) {
                const viewport = document.createElement('meta');
                viewport.name = 'viewport';
                viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
                document.head.appendChild(viewport);
            }

            console.log('Mobile optimizations applied');
        } catch (error) {
            console.warn('Failed to apply mobile optimizations:', error);
        }
    }

    startSessionMonitoring() {
        // Check session validity every 60 seconds to handle browser-specific issues
        setInterval(async () => {
            if (this.user && this.supabase && this.isSignedIn) {
                try {
                    const { data: { session }, error } = await this.supabase.auth.getSession();
                    // Only sign out if there's a clear auth error, not network issues
                    if (error && error.message && (error.message.includes('Invalid') || error.message.includes('expired'))) {
                        console.log('Session expired, signing out user');
                        this.user = null;
                        this.onUserSignedOut();
                    } else if (!session && !error) {
                        console.log('No session found, signing out user');
                        this.user = null;
                        this.onUserSignedOut();
                    }
                } catch (error) {
                    console.warn('Session check failed:', error);
                    // Don't sign out on network errors
                }
            }
        }, 60000); // Check every 60 seconds
    }

    getBrowserInfo() {
        const ua = navigator.userAgent;
        const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);
        const isBrave = navigator.brave !== undefined;
        const isEdge = /Edg/.test(ua);
        const isFirefox = /Firefox/.test(ua);
        
        return {
            isChrome: isChrome && !isBrave,
            isBrave,
            isEdge,
            isFirefox,
            needsSpecialHandling: (isChrome && !isBrave) || isBrave,
            userAgent: ua
        };
    }

    // Custom storage adapter to handle browser-specific issues and mobile compatibility
    createCustomStorage() {
        const isMobile = this.isMobileDevice();
        console.log('Creating custom storage for:', isMobile ? 'mobile' : 'desktop');
        
        return {
            getItem: (key) => {
                try {
                    // Try localStorage first
                    const value = localStorage.getItem(key);
                    if (value !== null) {
                        return value;
                    }
                    
                    // Fallback for mobile devices - try sessionStorage
                    if (isMobile && sessionStorage) {
                        return sessionStorage.getItem(key);
                    }
                    
                    return null;
                } catch (error) {
                    console.warn('Storage getItem failed:', error);
                    // Try sessionStorage as fallback
                    try {
                        return sessionStorage.getItem(key);
                    } catch (fallbackError) {
                        console.warn('SessionStorage getItem also failed:', fallbackError);
                        return null;
                    }
                }
            },
            setItem: (key, value) => {
                try {
                    localStorage.setItem(key, value);
                    // Also store in sessionStorage for mobile reliability
                    if (isMobile && sessionStorage) {
                        sessionStorage.setItem(key, value);
                    }
                } catch (error) {
                    console.warn('LocalStorage setItem failed:', error);
                    // Fallback to sessionStorage
                    try {
                        sessionStorage.setItem(key, value);
                    } catch (fallbackError) {
                        console.warn('SessionStorage setItem also failed:', fallbackError);
                    }
                }
            },
            removeItem: (key) => {
                try {
                    localStorage.removeItem(key);
                    // Also remove from sessionStorage
                    if (sessionStorage) {
                        sessionStorage.removeItem(key);
                    }
                } catch (error) {
                    console.warn('Storage removeItem failed:', error);
                }
            }
        };
    }

    setupEventListeners() {
        // Authentication event listeners - bind once, use arrow functions to preserve 'this'
        const showSignUpBtn = document.getElementById('showSignUpForm');
        const showSignInBtn = document.getElementById('showSignInForm');
        const signInBtn = document.getElementById('signInBtn');
        const signUpBtn = document.getElementById('signUpBtn');
        const logoutBtn = document.getElementById('logoutBtn');

        if (showSignUpBtn) showSignUpBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.showSignUpForm();
        });
        if (showSignInBtn) showSignInBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.showSignInForm();
        });
        if (signInBtn) signInBtn.addEventListener('click', () => this.signIn());
        if (signUpBtn) signUpBtn.addEventListener('click', () => this.signUp());
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.signOut());

        // PWA Install button event listener
        const installBtn = document.getElementById('installBtn');
        if (installBtn) installBtn.addEventListener('click', () => this.installPWA());

        // Claim Device event listeners
        const claimDeviceBtn = document.getElementById('claimDeviceBtn');
        const closeClaimDevice = document.getElementById('closeClaimDevice');
        const cancelClaimDevice = document.getElementById('cancelClaimDevice');
        const saveClaimDevice = document.getElementById('saveClaimDevice');

        if (claimDeviceBtn) claimDeviceBtn.addEventListener('click', () => this.openClaimDeviceModal());
        if (closeClaimDevice) closeClaimDevice.addEventListener('click', () => this.closeClaimDeviceModal());
        if (cancelClaimDevice) cancelClaimDevice.addEventListener('click', () => this.closeClaimDeviceModal());
        if (saveClaimDevice) saveClaimDevice.addEventListener('click', () => this.claimDevice());

        // Voice control event listeners - ensure these are properly bound
        const voiceBtn = document.getElementById('voiceBtn');
        const stopVoiceBtn = document.getElementById('stopVoiceBtn');
        
        if (voiceBtn) voiceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleVoiceControl();
        });
        if (stopVoiceBtn) stopVoiceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.stopVoiceControl();
        });

        // Add Device Modal Event Listeners
        const addDeviceBtn = document.getElementById('addDeviceBtn');
        const closeAddDevice = document.getElementById('closeAddDevice');
        const cancelAddDevice = document.getElementById('cancelAddDevice');
        const saveAddDevice = document.getElementById('saveAddDevice');

        if (addDeviceBtn) addDeviceBtn.addEventListener('click', () => this.openAddDeviceModal());
        if (closeAddDevice) closeAddDevice.addEventListener('click', () => this.closeAddDeviceModal());
        if (cancelAddDevice) cancelAddDevice.addEventListener('click', () => this.closeAddDeviceModal());
        if (saveAddDevice) saveAddDevice.addEventListener('click', () => this.addDevice());

        // Device control event listeners - use event delegation for dynamically created elements
        document.addEventListener('click', (e) => {
            // Handle device toggle buttons
            if (e.target.classList.contains('toggle-switch')) {
                e.preventDefault();
                e.stopPropagation();
                const deviceCard = e.target.closest('.device-card');
                if (deviceCard && deviceCard.dataset.deviceId) {
                    const deviceId = parseInt(deviceCard.dataset.deviceId);
                    this.toggleDevice(deviceId);
                }
                return;
            }

            // Handle edit device buttons
            if (e.target.classList.contains('edit-device-btn') || e.target.closest('.edit-device-btn')) {
                e.preventDefault();
                e.stopPropagation();
                const button = e.target.classList.contains('edit-device-btn') ? e.target : e.target.closest('.edit-device-btn');
                const deviceCard = button.closest('.device-card');
                if (deviceCard && deviceCard.dataset.deviceId) {
                    const deviceId = parseInt(deviceCard.dataset.deviceId);
                    this.openRenameDeviceModal(deviceId);
                }
                return;
            }

            // Handle delete device buttons
            if (e.target.classList.contains('delete-device-btn') || e.target.closest('.delete-device-btn')) {
                e.preventDefault();
                e.stopPropagation();
                const button = e.target.classList.contains('delete-device-btn') ? e.target : e.target.closest('.delete-device-btn');
                const deviceCard = button.closest('.device-card');
                if (deviceCard && deviceCard.dataset.deviceId) {
                    const deviceId = parseInt(deviceCard.dataset.deviceId);
                    this.openDeleteConfirmationModal(deviceId);
                }
                return;
            }
        });

        // Delete Device Modal Event Listeners
        const closeDeleteDevice = document.getElementById('closeDeleteDevice');
        const cancelDeleteDevice = document.getElementById('cancelDeleteDevice');
        const confirmDeleteDevice = document.getElementById('confirmDeleteDevice');

        if (closeDeleteDevice) closeDeleteDevice.addEventListener('click', () => this.closeDeleteDeviceModal());
        if (cancelDeleteDevice) cancelDeleteDevice.addEventListener('click', () => this.closeDeleteDeviceModal());
        if (confirmDeleteDevice) confirmDeleteDevice.addEventListener('click', () => this.deleteDevice());

        // Modal overlay listeners
        const addDeviceModal = document.getElementById('addDeviceModal');
        const claimDeviceModal = document.getElementById('claimDeviceModal');
        const deleteDeviceModal = document.getElementById('deleteDeviceModal');

        if (addDeviceModal) addDeviceModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) this.closeAddDeviceModal();
        });

        if (claimDeviceModal) claimDeviceModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) this.closeClaimDeviceModal();
        });
        
        if (deleteDeviceModal) deleteDeviceModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) this.closeDeleteDeviceModal();
        });

        // Enter key listeners for forms
        const loginPassword = document.getElementById('loginPassword');
        const signupUsername = document.getElementById('signupUsername');
        const deviceMacAddress = document.getElementById('deviceMacAddress');
        const newDeviceMacField = document.getElementById('newDeviceMacAddress');

        if (loginPassword) loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.signIn();
        });
        if (signupUsername) signupUsername.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.signUp();
        });
        if (deviceMacAddress) deviceMacAddress.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.claimDevice();
        });
        if (newDeviceMacField) newDeviceMacField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addDevice();
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
        // Hardcoded Supabase configuration - no user configuration needed
        // Note: These values are now hardcoded and cannot be changed through settings
    }

    async initializeSupabase() {
        // Hardcoded Supabase configuration
        const supabaseUrl = 'https://ahmseisassvgxbbccqyd.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFobXNlaXNhc3N2Z3hiYmNjcXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzOTgyNDEsImV4cCI6MjA3MTk3NDI0MX0.VR3dkEUvDzkH8s9YXQq3E3XCRSu62ldE1Qs9-DI1CaI';

        // Log browser information for debugging
        const browserInfo = this.getBrowserInfo();
        console.log('Browser info:', browserInfo);

        try {
            // Configure Supabase with proper options for browser compatibility
            const customStorage = this.createCustomStorage();
            
            // Enhanced configuration for mobile compatibility
            const supabaseConfig = {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true,
                    storage: customStorage,
                    storageKey: 'supabase.auth.token',
                    flowType: 'implicit'
                },
                global: {
                    headers: {
                        'X-Client-Info': 'supabase-js-web'
                    }
                },
                realtime: {
                    params: {
                        eventsPerSecond: 10
                    }
                }
            };

            // Additional mobile-specific configuration
            if (this.isMobileDevice()) {
                console.log('Mobile device detected, applying mobile-specific configuration');
                supabaseConfig.auth.autoRefreshToken = true;
                supabaseConfig.auth.persistSession = true;
                // Disable session URL detection on mobile to prevent issues
                supabaseConfig.auth.detectSessionInUrl = false;
            }
            
            this.supabase = supabase.createClient(supabaseUrl, supabaseKey, supabaseConfig);
            
            // Verify the client was created successfully
            if (!this.supabase || !this.supabase.auth) {
                throw new Error('Failed to create Supabase client properly');
            }
            
            // Test the connection with a simple operation
            await this.testSupabaseConnection();
            
            this.updateConnectionStatus('connected', 'Connected to Server');
            this.showToast('Successfully connected to Server!', 'success');
        } catch (error) {
            console.error('Supabase initialization error:', error);
            this.supabase = null; // Ensure it's null on error
            this.updateConnectionStatus('disconnected', 'Failed to connect to Server');
            this.showToast('Failed to connect to Server. Check your configuration.', 'error');
        }
    }

    // Test if Supabase connection is working
    async testSupabaseConnection() {
        try {
            // Simple test to verify the connection works
            const { data, error } = await this.supabase.auth.getSession();
            console.log('Supabase connection test successful');
            return true;
        } catch (error) {
            console.error('Supabase connection test failed:', error);
            throw new Error('Supabase connection test failed: ' + error.message);
        }
    }

    // Add retry mechanism for failed operations
    async retryOperation(operation, maxRetries = 3, delay = 1000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                console.warn(`Operation failed (attempt ${attempt}/${maxRetries}):`, error);
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay * attempt));
            }
        }
    }

    // Reconnect to Supabase if connection is lost
    async reconnectSupabase() {
        console.log('Attempting to reconnect to Supabase...');
        this.supabase = null;
        
        try {
            await this.initializeSupabase();
            if (this.supabase && this.supabase.auth) {
                await this.checkAuthState();
                this.showToast('Reconnected successfully!', 'success');
                return true;
            }
        } catch (error) {
            console.error('Reconnection failed:', error);
            this.showToast('Reconnection failed. Please refresh the page.', 'error');
        }
        
        return false;
    }

    // Detect if running on mobile device
    isMobileDevice() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        
        // Check for mobile patterns
        const mobilePatterns = [
            /Android/i,
            /webOS/i,
            /iPhone/i,
            /iPad/i,
            /iPod/i,
            /BlackBerry/i,
            /Windows Phone/i,
            /Mobile/i
        ];
        
        return mobilePatterns.some(pattern => pattern.test(userAgent)) || 
               (window.innerWidth <= 768 && window.innerHeight <= 1024);
    }

    // PWA Install functionality
    setupPWAInstall() {
        // Listen for the beforeinstallprompt event
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('PWA install prompt available');
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Store the event for later use
            this.deferredPrompt = e;
            // Show the install button
            this.showInstallButton();
        });

        // Listen for app installation
        window.addEventListener('appinstalled', (e) => {
            console.log('PWA was installed');
            this.hideInstallButton();
            this.showToast('App installed successfully!', 'success');
        });

        // Check if app is already installed
        if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
            console.log('App is running in standalone mode (already installed)');
            this.hideInstallButton();
        }

        // For iOS Safari, check if it's in standalone mode
        if (window.navigator.standalone === true) {
            console.log('App is running in iOS standalone mode');
            this.hideInstallButton();
        }
    }

    showInstallButton() {
        const installBtn = document.getElementById('installBtn');
        if (installBtn) {
            installBtn.style.display = 'block';
            console.log('Install button shown');
        }
    }

    hideInstallButton() {
        const installBtn = document.getElementById('installBtn');
        if (installBtn) {
            installBtn.style.display = 'none';
            console.log('Install button hidden');
        }
    }

    async installPWA() {
        if (!this.deferredPrompt) {
            // For iOS Safari, show instructions
            if (this.isiOS()) {
                this.showIOSInstallInstructions();
                return;
            }
            
            console.log('No install prompt available');
            this.showToast('Install not available. Try using Chrome or Edge browser.', 'info');
            return;
        }

        try {
            // Show the install prompt
            this.deferredPrompt.prompt();
            
            // Wait for the user to respond to the prompt
            const { outcome } = await this.deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                console.log('User accepted the install prompt');
                this.showToast('Installing app...', 'success');
            } else {
                console.log('User dismissed the install prompt');
                this.showToast('Installation cancelled', 'info');
            }
            
            // Clear the saved prompt since it can only be used once
            this.deferredPrompt = null;
            this.hideInstallButton();
            
        } catch (error) {
            console.error('Error during PWA installation:', error);
            this.showToast('Installation failed. Please try again.', 'error');
        }
    }

    isiOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    showIOSInstallInstructions() {
        const message = 'To install this app on iOS:\n1. Tap the Share button\n2. Tap "Add to Home Screen"\n3. Tap "Add"';
        alert(message);
    }

    async checkAuthState() {
        if (!this.supabase || !this.supabase.auth) {
            console.warn('Supabase client not available during auth state check');
            this.onUserSignedOut();
            return;
        }

        try {
            // Get current session with proper error handling
            const { data: { session }, error } = await this.supabase.auth.getSession();
            
            if (error) {
                console.warn('Error getting session:', error);
                // Only clear session data if it's an auth-related error, not network issues
                if (error.message && (error.message.includes('Invalid') || error.message.includes('expired'))) {
                    localStorage.removeItem('supabase.auth.token');
                    sessionStorage.removeItem('supabase.auth.token');
                }
                this.onUserSignedOut();
                return;
            }
            
            if (session?.user) {
                this.user = session.user;
                await this.onUserSignedIn();
            } else {
                this.onUserSignedOut();
            }

            // Listen for auth changes with better error handling
            this.supabase.auth.onAuthStateChange(async (event, session) => {
                try {
                    console.log('Auth state change:', event, session?.user?.email || 'no user');
                    
                    if (event === 'SIGNED_IN' && session?.user) {
                        this.user = session.user;
                        await this.onUserSignedIn();
                    } else if (event === 'SIGNED_OUT' || !session) {
                        this.user = null;
                        this.onUserSignedOut();
                    }
                    // Handle token refresh events
                    else if (event === 'TOKEN_REFRESHED' && session?.user) {
                        console.log('Token refreshed successfully');
                        this.user = session.user;
                    }
                    // Ignore other events like INITIAL_SESSION to prevent duplicate initialization
                } catch (error) {
                    console.error('Error handling auth state change:', error);
                    // Force sign out on error
                    this.user = null;
                    this.onUserSignedOut();
                }
            });
        } catch (error) {
            console.error('Error in checkAuthState:', error);
            this.onUserSignedOut();
        }
    }

    async onUserSignedIn() {
        // Prevent duplicate initialization
        if (this.isSignedIn) {
            return;
        }
        
        this.isSignedIn = true;
        
        // Show main app, hide auth
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('mainAppSection').style.display = 'block';
        
        // Update user info
        document.getElementById('userEmail').textContent = this.user.email;
        
        // Re-initialize voice control to ensure it works properly
        this.setupVoiceControl();
        
        // Fetch user's devices and setup real-time subscriptions
        await this.fetchUserDevices();
        this.setupRealtimeSubscriptions();
        
        this.showToast(`Welcome back, ${this.user.email}!`, 'success');
    }

    onUserSignedOut() {
        // Reset sign-in state
        this.isSignedIn = false;
        
        // Stop voice control if active
        if (this.isListening) {
            this.stopVoiceControl();
        }
        
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
        
        // Reset user
        this.user = null;
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

        // Check if Supabase is properly initialized
        if (!this.supabase || !this.supabase.auth) {
            this.showToast('Connection not established. Please refresh the page and try again.', 'error');
            console.error('Supabase client not initialized properly');
            
            // Offer to reconnect on mobile devices
            if (this.isMobileDevice()) {
                setTimeout(async () => {
                    const reconnected = await this.reconnectSupabase();
                    if (reconnected) {
                        this.showToast('Connection restored. Please try signing up again.', 'info');
                    }
                }, 2000);
            }
            return;
        }

        try {
            await this.updateButtonState('signUpBtn', true, 'Create Account', 'Creating Account...');

            // Use retry mechanism for better mobile reliability
            const signUpOperation = async () => {
                return await this.supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            username: username
                        }
                    }
                });
            };

            const { data, error } = await this.retryOperation(signUpOperation, 2, 1500);

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

        // Check if Supabase is properly initialized
        if (!this.supabase || !this.supabase.auth) {
            this.showToast('Connection not established. Please refresh the page and try again.', 'error');
            console.error('Supabase client not initialized properly');
            
            // Offer to reconnect on mobile devices
            if (this.isMobileDevice()) {
                setTimeout(async () => {
                    const reconnected = await this.reconnectSupabase();
                    if (reconnected) {
                        this.showToast('Connection restored. Please try signing in again.', 'info');
                    }
                }, 2000);
            }
            return;
        }

        try {
            await this.updateButtonState('signInBtn', true, 'Sign In', 'Signing In...');

            // Use retry mechanism for better mobile reliability
            const signInOperation = async () => {
                return await this.supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });
            };

            const { data, error } = await this.retryOperation(signInOperation, 2, 1500);

            if (error) throw error;

        } catch (error) {
            console.error('Sign in error:', error);
            this.showToast(error.message || 'Failed to sign in', 'error');
        } finally {
            await this.updateButtonState('signInBtn', false, 'Sign In', 'Signing In...');
        }
    }

    async signOut() {
        const browserInfo = this.getBrowserInfo();
        console.log('Sign out initiated for browser:', browserInfo);
        
        try {
            // Stop voice control if active
            if (this.isListening) {
                this.stopVoiceControl();
            }
            
            // Clean up any active subscriptions
            if (this.realtimeChannel) {
                this.realtimeChannel.unsubscribe();
                this.realtimeChannel = null;
            }
            
            // Check if we have a valid session before attempting to sign out
            console.log('Checking current session...');
            const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();
            
            if (sessionError) {
                console.warn('Error getting session:', sessionError);
            }
            
            if (session) {
                console.log('Valid session found, attempting sign out...');
                // Attempt global sign out first
                const { error } = await this.supabase.auth.signOut({ scope: 'global' });
                if (error) {
                    console.warn('Global sign out failed, attempting local sign out:', error);
                    // If global sign out fails, try local sign out
                    const { error: localError } = await this.supabase.auth.signOut({ scope: 'local' });
                    if (localError) throw localError;
                }
                console.log('Sign out successful');
            } else {
                // No active session, perform local cleanup
                console.log('No active session found, performing local cleanup');
                await this.supabase.auth.signOut({ scope: 'local' });
            }
            
            // Force clear local storage as backup
            console.log('Clearing local storage...');
            localStorage.removeItem('supabase.auth.token');
            
            // Manually trigger sign out state
            this.user = null;
            this.onUserSignedOut();
            
            this.showToast('Successfully signed out', 'success');
            
        } catch (error) {
            console.error('Sign out error:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            
            // Even if sign out fails on server, clear local session
            try {
                console.log('Performing emergency local cleanup...');
                localStorage.removeItem('supabase.auth.token');
                this.user = null;
                this.onUserSignedOut();
                this.showToast('Signed out locally (server sign out failed)', 'warning');
            } catch (localError) {
                console.error('Local cleanup error:', localError);
                this.showToast('Failed to sign out completely. Please refresh the page.', 'error');
            }
        }
    }

    async refreshSession() {
        if (!this.supabase) return false;
        
        try {
            console.log('Attempting to refresh session...');
            const { data, error } = await this.supabase.auth.refreshSession();
            
            if (error) {
                console.error('Session refresh failed:', error);
                return false;
            }
            
            if (data.session) {
                console.log('Session refreshed successfully');
                this.user = data.session.user;
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error refreshing session:', error);
            return false;
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

            const { data, error } = await this.supabase.functions.invoke('device-claim', {
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

    // Device deletion functionality
    openDeleteConfirmationModal(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            this.showToast('Device not found', 'error');
            return;
        }

        // Store the device ID for deletion
        this.deviceToDelete = deviceId;
        
        // Update the modal with device information
        const deviceNameDisplay = document.getElementById('deviceNameToDelete');
        if (deviceNameDisplay) {
            deviceNameDisplay.textContent = `"${device.name}" (GPIO ${device.gpio})`;
        }

        this.openModal('deleteDeviceModal');
    }

    closeDeleteDeviceModal() {
        this.deviceToDelete = null;
        this.closeModal('deleteDeviceModal');
    }

    async deleteDevice() {
        if (!this.deviceToDelete || !this.supabase || !this.user) {
            this.showToast('Cannot delete device at this time', 'error');
            return;
        }

        const device = this.devices.find(d => d.id === this.deviceToDelete);
        if (!device) {
            this.showToast('Device not found', 'error');
            this.closeDeleteDeviceModal();
            return;
        }

        try {
            await this.updateButtonState('confirmDeleteDevice', true, 'Delete Device', 'Deleting...');

            // Call the Supabase function to delete the device
            const { data, error } = await this.supabase.functions.invoke('delete-device', {
                body: { device_id: this.deviceToDelete }
            });

            if (error) throw error;

            // Remove device from local array immediately for better UX
            this.devices = this.devices.filter(d => d.id !== this.deviceToDelete);
            
            // Remove device card from UI
            const card = document.querySelector(`[data-device-id="${this.deviceToDelete}"]`);
            if (card) {
                card.remove();
            }

            this.closeDeleteDeviceModal();
            this.showToast(`Device "${device.name}" deleted successfully!`, 'success');

        } catch (error) {
            console.error('Delete device error:', error);
            this.showToast(error.message || 'Failed to delete device. Please try again.', 'error');
            
            // If deletion failed, refresh devices to ensure UI is in sync
            await this.fetchUserDevices();
            
        } finally {
            await this.updateButtonState('confirmDeleteDevice', false, 'Delete Device', 'Deleting...');
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
        if (!deviceId || !this.supabase || !this.user) {
            this.showToast('Device or user not found', 'error');
            return;
        }
        
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            this.showToast('Device not found', 'error');
            return;
        }

        const newState = device.state ? 0 : 1;
        
        try {
            // Optimistically update UI
            device.state = newState;
            this.updateDeviceUI(device);
            
            const { error } = await this.supabase
                .from('devices')
                .update({ 
                    state: newState, 
                    updated_at: new Date().toISOString() 
                })
                .eq('id', deviceId);

            if (error) {
                // Revert UI changes on error
                device.state = device.state ? 0 : 1;
                this.updateDeviceUI(device);
                console.error('Error updating device:', error);
                this.showToast('Failed to update device', 'error');
                return;
            }

            this.showToast(`${device.name} turned ${newState ? 'ON' : 'OFF'}`, 'success');
        } catch (error) {
            // Revert UI changes on error
            device.state = device.state ? 0 : 1;
            this.updateDeviceUI(device);
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
                    <button class="edit-device-btn" title="Rename Device" data-device-id="${device.id}">
                        <span class="edit-icon">✏️</span>
                    </button>
                    <button class="delete-device-btn" title="Delete Device" data-device-id="${device.id}">
                        <span class="delete-icon">🗑️</span>
                    </button>
                    <div class="device-icon">${icons[type] || '⚡️'}</div>
                </div>
            </div>
            <div class="device-controls">
                <div class="device-status">${device.state ? 'ON' : 'OFF'}</div>
                <button class="toggle-switch ${device.state ? 'active' : ''}" 
                        data-device-id="${device.id}"></button>
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
        // Clean up existing recognition if any
        if (this.recognition) {
            this.recognition.abort();
            this.recognition = null;
        }

        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                try {
                    const command = event.results[event.results.length - 1][0].transcript.toLowerCase();
                    console.log('Voice command:', command);
                    this.processVoiceCommand(command);
                } catch (error) {
                    console.error('Error processing voice command:', error);
                    this.showToast('Error processing voice command', 'error');
                }
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                if (event.error !== 'aborted') {
                    this.showToast('Voice recognition error: ' + event.error, 'error');
                    // Reset state on error
                    this.isListening = false;
                    this.isProcessingVoiceCommand = false;
                    const voicePanel = document.getElementById('voicePanel');
                    if (voicePanel) voicePanel.style.display = 'none';
                }
            };

            this.recognition.onend = () => {
                if (this.isListening && !this.isProcessingVoiceCommand) {
                    // Restart recognition if we're still supposed to be listening
                    try {
                        this.recognition.start();
                    } catch (error) {
                        console.error('Error restarting recognition:', error);
                        this.isListening = false;
                        const voicePanel = document.getElementById('voicePanel');
                        if (voicePanel) voicePanel.style.display = 'none';
                    }
                }
            };

            this.recognition.onstart = () => {
                console.log('Voice recognition started');
            };

        } else {
            const voiceBtn = document.getElementById('voiceBtn');
            if (voiceBtn) voiceBtn.style.display = 'none';
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
        if (!this.recognition) {
            this.setupVoiceControl();
        }
        
        if (!this.recognition) {
            this.showToast('Voice recognition not available', 'error');
            return;
        }

        try {
            this.isListening = true;
            this.isProcessingVoiceCommand = false;
            this.recognition.start();
            const voicePanel = document.getElementById('voicePanel');
            if (voicePanel) voicePanel.style.display = 'block';
            this.showToast('Voice control activated', 'success');
        } catch (error) {
            console.error('Error starting voice control:', error);
            this.isListening = false;
            this.showToast('Failed to start voice control', 'error');
        }
    }

    stopVoiceControl() {
        if (!this.recognition) return;

        try {
            this.isListening = false;
            this.isProcessingVoiceCommand = false;
            this.recognition.stop();
            const voicePanel = document.getElementById('voicePanel');
            if (voicePanel) voicePanel.style.display = 'none';
            this.showToast('Voice control deactivated', 'success');
        } catch (error) {
            console.error('Error stopping voice control:', error);
            // Force cleanup
            this.isListening = false;
            this.isProcessingVoiceCommand = false;
            const voicePanel = document.getElementById('voicePanel');
            if (voicePanel) voicePanel.style.display = 'none';
        }
    }

    stopVoiceControlAfterCommand() {
        if (!this.recognition) return;

        try {
            this.isListening = false;
            this.isProcessingVoiceCommand = false;
            this.recognition.stop();
            const voicePanel = document.getElementById('voicePanel');
            if (voicePanel) voicePanel.style.display = 'none';
            this.showToast('Voice command executed. Tap voice button to give another command.', 'info');
        } catch (error) {
            console.error('Error stopping voice control after command:', error);
            // Force cleanup
            this.isListening = false;
            this.isProcessingVoiceCommand = false;
            const voicePanel = document.getElementById('voicePanel');
            if (voicePanel) voicePanel.style.display = 'none';
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

        const deviceType = this.getDeviceType(device.name);
        const deviceIcon = this.getDeviceIcon(deviceType);

        card.innerHTML = `
            <div class="device-header">
                <div class="device-info">
                    <h3 class="device-name">${device.name}</h3>
                    <div class="device-gpio">GPIO ${device.gpio}</div>
                </div>
                <div class="device-actions">
                    <button class="edit-device-btn" title="Rename Device" data-device-id="${device.id}">
                        <span class="edit-icon">✏️</span>
                    </button>
                    <div class="device-icon">${deviceIcon}</div>
                </div>
            </div>
            <div class="device-controls">
                <div class="device-status">${device.state ? 'ON' : 'OFF'}</div>
                <button class="toggle-switch ${device.state ? 'active' : ''}" 
                        data-device-id="${device.id}"></button>
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

        // Check for duplicate GPIO only (allow same MAC address for different devices)
        const existingDevice = this.devices.find(d => d.gpio === gpio);
        if (existingDevice) {
            this.showToast(`GPIO ${gpio} is already in use by "${existingDevice.name}"`, 'error');
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
        if (!device) {
            this.showToast('Device not found', 'error');
            return;
        }

        // Create rename modal if it doesn't exist
        this.createRenameModal();

        // Populate form with current device name
        const nameInput = document.getElementById('renameDeviceName');
        const modal = document.getElementById('renameDeviceModal');
        
        if (nameInput && modal) {
            nameInput.value = device.name;
            modal.dataset.deviceId = deviceId;
            modal.classList.add('active');
            // Focus on the input
            setTimeout(() => nameInput.focus(), 100);
        } else {
            this.showToast('Failed to open rename dialog', 'error');
        }
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
                            <input type="text" id="renameDeviceName" placeholder="Enter new device name" maxlength="50">
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

        // Add event listeners with proper error handling
        const closeBtn = document.getElementById('closeRenameDevice');
        const cancelBtn = document.getElementById('cancelRenameDevice');
        const saveBtn = document.getElementById('saveRenameDevice');
        const modal = document.getElementById('renameDeviceModal');
        const nameInput = document.getElementById('renameDeviceName');

        if (closeBtn) closeBtn.addEventListener('click', () => this.closeRenameDeviceModal());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeRenameDeviceModal());
        if (saveBtn) saveBtn.addEventListener('click', () => this.renameDevice());
        
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay')) this.closeRenameDeviceModal();
            });
        }
        
        // Add enter key support
        if (nameInput) {
            nameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.renameDevice();
                }
            });
        }
    }

    closeRenameDeviceModal() {
        this.closeModal('renameDeviceModal');
    }

    async renameDevice() {
        const modal = document.getElementById('renameDeviceModal');
        const nameInput = document.getElementById('renameDeviceName');
        const saveBtn = document.getElementById('saveRenameDevice');
        
        if (!modal || !nameInput || !saveBtn) {
            this.showToast('Modal elements not found', 'error');
            return;
        }
        
        const deviceId = parseInt(modal.dataset.deviceId);
        const newName = nameInput.value.trim();

        if (!this.validateForm([{ value: newName, name: 'device name' }])) {
            return;
        }

        if (newName.length > 50) {
            this.showToast('Device name must be 50 characters or less', 'error');
            return;
        }

        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            this.showToast('Device not found', 'error');
            this.closeRenameDeviceModal();
            return;
        }

        if (device.name === newName) {
            this.closeRenameDeviceModal();
            return; // No change needed
        }

        try {
            // Disable button during operation
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            
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
        } finally {
            // Re-enable button
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }

    // Debug method to help diagnose authentication issues
    async debugAuth() {
        console.log('=== AUTHENTICATION DEBUG INFO ===');
        
        const browserInfo = this.getBrowserInfo();
        const isMobile = this.isMobileDevice();
        console.log('Browser Info:', browserInfo);
        console.log('Is Mobile Device:', isMobile);
        
        // Check localStorage
        const authToken = localStorage.getItem('supabase.auth.token');
        console.log('Auth token in localStorage:', authToken ? 'Present' : 'Not found');
        
        // Check sessionStorage on mobile
        if (isMobile) {
            const sessionToken = sessionStorage.getItem('supabase.auth.token');
            console.log('Auth token in sessionStorage:', sessionToken ? 'Present' : 'Not found');
        }
        
        if (authToken) {
            try {
                const parsed = JSON.parse(authToken);
                console.log('Token structure:', {
                    hasAccessToken: !!parsed.access_token,
                    hasRefreshToken: !!parsed.refresh_token,
                    expiresAt: parsed.expires_at,
                    currentTime: Math.floor(Date.now() / 1000),
                    isExpired: parsed.expires_at < Math.floor(Date.now() / 1000)
                });
            } catch (e) {
                console.log('Error parsing auth token:', e);
            }
        }
        
        // Check current session
        if (this.supabase) {
            try {
                const { data: { session }, error } = await this.supabase.auth.getSession();
                console.log('Current session from Supabase:', session ? 'Valid' : 'None');
                if (error) console.log('Session error:', error);
                if (session) {
                    console.log('Session details:', {
                        userId: session.user?.id,
                        email: session.user?.email,
                        expiresAt: session.expires_at,
                        currentTime: Math.floor(Date.now() / 1000),
                        isExpired: session.expires_at < Math.floor(Date.now() / 1000)
                    });
                }
            } catch (error) {
                console.log('Error getting session:', error);
            }
        } else {
            console.log('Supabase client not initialized');
        }
        
        console.log('App user state:', this.user ? 'Logged in' : 'Not logged in');
        console.log('=== END DEBUG INFO ===');
        
        return {
            browser: browserInfo,
            hasToken: !!authToken,
            hasSession: !!(await this.supabase?.auth.getSession())?.data?.session,
            userState: !!this.user
        };
    }

    // Mobile-specific debug information
    async debugMobile() {
        if (!this.isMobileDevice()) {
            console.log('Not a mobile device');
            return;
        }

        console.log('=== MOBILE DEBUG INFO ===');
        console.log('User Agent:', navigator.userAgent);
        console.log('Viewport:', {
            width: window.innerWidth,
            height: window.innerHeight,
            ratio: window.devicePixelRatio
        });
        console.log('Touch Support:', 'ontouchstart' in window);
        console.log('Local Storage Available:', typeof(Storage) !== "undefined");
        console.log('Service Worker Support:', 'serviceWorker' in navigator);
        
        // Test storage
        try {
            localStorage.setItem('test', 'test');
            localStorage.removeItem('test');
            console.log('Local Storage: Working');
        } catch (e) {
            console.log('Local Storage: Failed -', e);
        }

        try {
            sessionStorage.setItem('test', 'test');
            sessionStorage.removeItem('test');
            console.log('Session Storage: Working');
        } catch (e) {
            console.log('Session Storage: Failed -', e);
        }

        console.log('=== END MOBILE DEBUG INFO ===');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new HomeAutomationApp();
    
    // Make debug functions available globally
    window.debugAuth = () => window.app.debugAuth();
    window.debugMobile = () => window.app.debugMobile();
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