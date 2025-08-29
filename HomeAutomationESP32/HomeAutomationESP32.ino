/*
 * ESP32 Home Automation System with Supabase Integration
 * Features:
 * - Real-time device control via Supabase WebSocket
 * - Supports ADD DEVICE functionality (INSERT events)
 * - Supports RENAME DEVICE functionality (UPDATE events with name changes)
 * - Dynamic GPIO initialization for new devices
 * - Automatic reconnection and heartbeat
 * - Fetches and applies existing device states on startup
 * Version: 3.0 (Fixed startup state fetching and device control)
 */

#include <WiFi.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include <WiFiClientSecure.h>

// =================== CONFIGURATION ===================
const char* WIFI_SSID = "JioFiber-vishnu_4G";
const char* WIFI_PASSWORD = "aeasap975";
const char* SUPABASE_PROJECT_ID = "ahmseisassvgxbbccqyd";
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFobXNlaXNhc3N2Z3hiYmNjcXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzOTgyNDEsImV4cCI6MjA3MTk3NDI0MX0.VR3dkEUvDzkH8s9YXQq3E3XCRSu62ldE1Qs9-DI1CaI";
const int DEVICE_PINS[] = {23, 22, 21, 19, 18, 5, 4, 2};
const int NUM_PINS = sizeof(DEVICE_PINS) / sizeof(DEVICE_PINS[0]);
const unsigned long HEARTBEAT_INTERVAL = 30000; // 30 seconds

// =================== GLOBAL VARIABLES ===================
WebSocketsClient webSocket;
int messageRef = 1;
bool initializedPins[40] = {false}; // Track which pins have been initialized
bool deviceStatesLoaded = false; // Track if initial states have been loaded

// =================== FUNCTION DECLARATIONS ===================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
void handleWebSocketMessage(uint8_t * payload, size_t length);
void subscribeToDevicesTable();
void sendHeartbeat();
void initializeGPIO(int gpio);
void loadExistingDevices();
void applyDeviceState(int gpio, int state, const char* deviceName);

void setup() {
    Serial.begin(115200);
    Serial.println("\n=== ESP32 Home Automation (DB Version) ===");
    
    // Initialize predefined device pins
    for (int i = 0; i < NUM_PINS; i++) {
        initializeGPIO(DEVICE_PINS[i]);
    }

    // Connect to WiFi
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi connected!");
    
    // Setup Supabase WebSocket connection
    String host = String(SUPABASE_PROJECT_ID) + ".supabase.co";
    String path = "/realtime/v1/websocket?apikey=" + String(SUPABASE_ANON_KEY) + "&vsn=1.0.0";
    
    webSocket.beginSSL(host.c_str(), 443, path.c_str());
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
}

void loop() {
    webSocket.loop();
    static unsigned long lastHeartbeat = 0;
    if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
        sendHeartbeat();
        lastHeartbeat = millis();
    }
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            Serial.println("WebSocket Disconnected.");
            deviceStatesLoaded = false; // Reset flag on disconnect
            break;
        case WStype_CONNECTED:
            Serial.println("WebSocket Connected!");
            subscribeToDevicesTable();
            // Load existing devices after successful connection
            delay(2000); // Wait for subscription to be processed
            loadExistingDevices();
            break;
        case WStype_TEXT:
            handleWebSocketMessage(payload, length);
            break;
        default:
            break;
    }
}

void subscribeToDevicesTable() {
    DynamicJsonDocument doc(1024);
    doc["topic"] = "realtime:public:devices";
    doc["event"] = "phx_join";
    doc["ref"] = messageRef++;
    
    // Create payload structure for both UPDATE and INSERT events
    JsonObject payload = doc.createNestedObject("payload");
    JsonObject config = payload.createNestedObject("config");
    JsonArray postgresChanges = config.createNestedArray("postgres_changes");
    
    // Subscribe to UPDATE events (device state changes)
    JsonObject updateEvent = postgresChanges.createNestedObject();
    updateEvent["event"] = "UPDATE";
    updateEvent["schema"] = "public";
    updateEvent["table"] = "devices";
    
    // Subscribe to INSERT events (new devices added)
    JsonObject insertEvent = postgresChanges.createNestedObject();
    insertEvent["event"] = "INSERT";
    insertEvent["schema"] = "public";
    insertEvent["table"] = "devices";
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);
    Serial.println("Subscribing to devices table updates and inserts...");
}

void handleWebSocketMessage(uint8_t * payload, size_t length) {
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, payload, length);

    String event = doc["event"];
    
    if (event == "phx_reply") {
        String status = doc["payload"]["status"];
        if (status == "ok") {
            Serial.println("Subscription to devices table successful.");
        } else {
            Serial.println("Subscription failed!");
        }
    } else if (event == "postgres_changes") {
        // Use the working JSON parsing path from your original code
        JsonObject data = doc["payload"]["data"]["record"];
        
        int gpio = data["gpio"];
        int state = data["state"];
        const char* deviceName = data["name"];
        int deviceId = data["id"];

        Serial.printf("Received update for GPIO %d, new state: %d", gpio, state);
        if (deviceName) {
            Serial.printf(", device: %s", deviceName);
        }
        Serial.println();

        // Apply the device state using the new helper function
        applyDeviceState(gpio, state, deviceName);
    } else if (event == "broadcast") {
        // Handle broadcast events that might contain device states
        Serial.println("Received broadcast event");
        JsonObject data = doc["payload"];
        if (data.containsKey("devices")) {
            JsonArray devices = data["devices"];
            for (JsonObject device : devices) {
                int gpio = device["gpio"];
                int state = device["state"];
                const char* deviceName = device["name"];
                Serial.printf("Loading existing device: %s (GPIO %d, State %d)\n", 
                             deviceName ? deviceName : "Unknown", gpio, state);
                applyDeviceState(gpio, state, deviceName);
            }
        }
    }
}


// Helper function to initialize GPIO pins
void initializeGPIO(int gpio) {
    if (gpio >= 0 && gpio <= 39 && !initializedPins[gpio]) {
        pinMode(gpio, OUTPUT);
        digitalWrite(gpio, LOW); // Start in OFF state
        initializedPins[gpio] = true;
        Serial.printf("GPIO %d configured as OUTPUT\n", gpio);
    }
}

// Helper function to apply device state changes
void applyDeviceState(int gpio, int state, const char* deviceName) {
    if (gpio >= 0 && gpio <= 39) {
        // Initialize GPIO if not already done (safety check)
        if (!initializedPins[gpio]) {
            initializeGPIO(gpio);
            Serial.printf("GPIO %d initialized on first use\n", gpio);
        }
        
        digitalWrite(gpio, state == 1 ? HIGH : LOW);
        Serial.printf("GPIO %d set to %s", gpio, state == 1 ? "HIGH" : "LOW");
        if (deviceName) {
            Serial.printf(" (%s)", deviceName);
        }
        Serial.println();
    } else {
        Serial.printf("Invalid GPIO %d\n", gpio);
    }
}

void sendHeartbeat() {
    DynamicJsonDocument doc(256);
    doc["topic"] = "phoenix";
    doc["event"] = "heartbeat";
    doc["payload"] = JsonObject();
    doc["ref"] = messageRef++;
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);
    Serial.println("Heartbeat sent.");
}

void loadExistingDevices() {
    if (deviceStatesLoaded) {
        Serial.println("Device states already loaded, skipping...");
        return;
    }
    
    Serial.println("Fetching existing device states from Supabase...");
    
    WiFiClientSecure client;
    client.setInsecure(); // For simplicity, skip certificate verification
    
    String host = String(SUPABASE_PROJECT_ID) + ".supabase.co";
    String url = "/rest/v1/devices?select=*";
    
    if (client.connect(host.c_str(), 443)) {
        // Create HTTP GET request
        client.print("GET " + url + " HTTP/1.1\r\n");
        client.print("Host: " + host + "\r\n");
        client.print("apikey: " + String(SUPABASE_ANON_KEY) + "\r\n");
        client.print("Authorization: Bearer " + String(SUPABASE_ANON_KEY) + "\r\n");
        client.print("Content-Type: application/json\r\n");
        client.print("Connection: close\r\n\r\n");
        
        // Wait for response
        unsigned long timeout = millis();
        while (client.available() == 0) {
            if (millis() - timeout > 10000) {
                Serial.println("Timeout while fetching device states!");
                client.stop();
                return;
            }
            delay(100);
        }
        
        // Read response
        String response = "";
        bool headerEnded = false;
        while (client.available()) {
            String line = client.readStringUntil('\n');
            if (!headerEnded) {
                if (line == "\r") {
                    headerEnded = true;
                }
            } else {
                response += line;
            }
        }
        client.stop();
        
        Serial.println("Device data received:");
        Serial.println(response);
        
        // Parse JSON response
        DynamicJsonDocument doc(2048);
        DeserializationError error = deserializeJson(doc, response);
        
        if (error) {
            Serial.printf("JSON parsing failed: %s\n", error.c_str());
            return;
        }
        
        // Apply device states
        if (doc.is<JsonArray>()) {
            JsonArray devices = doc.as<JsonArray>();
            Serial.printf("Found %d devices in database\n", devices.size());
            
            for (JsonObject device : devices) {
                int gpio = device["gpio"];
                int state = device["state"];
                const char* deviceName = device["name"];
                
                Serial.printf("Loading device: %s (GPIO %d, State %d)\n", 
                             deviceName ? deviceName : "Unknown", gpio, state);
                applyDeviceState(gpio, state, deviceName);
            }
            
            deviceStatesLoaded = true;
            Serial.println("All existing device states loaded successfully!");
        } else {
            Serial.println("Unexpected response format");
        }
    } else {
        Serial.println("Failed to connect to Supabase for device state fetching");
    }
}