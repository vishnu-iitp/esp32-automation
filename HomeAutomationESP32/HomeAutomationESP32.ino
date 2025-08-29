/*
 * ESP32 Home Automation System with Supabase Integration
 * 
 * Features:
 * - Real-time device control via Supabase WebSocket
 * - Supports ADD DEVICE functionality (INSERT events)
 * - Supports RENAME DEVICE functionality (UPDATE events with name changes)
 * - Dynamic GPIO initialization for new devices
 * - Automatic reconnection and heartbeat
 * 
 * Author: ESP32 Home Automation Team
 * Version: 2.0 (with Add/Rename Device Support)
 */

#include <WiFi.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>

// =================== CONFIGURATION ===================
const char* WIFI_SSID = "JioFiber-vishnu_4G";
const char* WIFI_PASSWORD = "aeasap975";
const char* SUPABASE_PROJECT_ID = "ahmseisassvgxbbccqyd";
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFobXNlaXNhc3N2Z3hiYmNjcXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzOTgyNDEsImV4cCI6MjA3MTk3NDI0MX0.VR3dkEUvDzkH8s9YXQq3E3XCRSu62ldE1Qs9-DI1CaI";

// Device JWT Authentication - Replace with your device-specific JWT
const char* DEVICE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NTg2OTJkMi0yNmFlLTQyNzItOWY4Mi05Yjc2ZjhlYzYwMjYiLCJyb2xlIjoiZGV2aWNlX3VzZXIiLCJ1c2VyX2lkIjoiNjU4NjkyZDItMjZhZS00MjcyLTlmODItOWI3NmY4ZWM2MDI2IiwiaXNzIjoiZXNwMzItZGV2aWNlLWF1dGgiLCJhdWQiOiJlc3AzMi1kZXZpY2VzIiwiZXhwIjoxOTE0MTY2ODM4LCJpYXQiOjE3NTY0ODY4Mzh9.44Sb08qgfHEB4uzdDeu46QV12jvG-WOGVSaO9hkTGIo";

const int DEVICE_PINS[] = {23, 22, 21, 19, 18, 5, 4, 2};
const int NUM_PINS = sizeof(DEVICE_PINS) / sizeof(DEVICE_PINS[0]);
const unsigned long HEARTBEAT_INTERVAL = 30000; // 30 seconds

// =================== GLOBAL VARIABLES ===================
WebSocketsClient webSocket;
int messageRef = 1;
bool initializedPins[40] = {false}; // Track which pins have been initialized

// =================== FUNCTION DECLARATIONS ===================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
void handleWebSocketMessage(uint8_t * payload, size_t length);
void subscribeToDevicesTable();
void sendHeartbeat();
void initializeGPIO(int gpio);

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

    // Setup Supabase WebSocket connection with JWT authentication
    String host = String(SUPABASE_PROJECT_ID) + ".supabase.co";
    String path = "/realtime/v1/websocket?apikey=" + String(SUPABASE_ANON_KEY) + "&vsn=1.0.0";
    
    // Add JWT authentication if device JWT is provided
    if (String(DEVICE_JWT) != "PASTE_YOUR_JWT_HERE" && strlen(DEVICE_JWT) > 10) {
        path += "&jwt=" + String(DEVICE_JWT);
        Serial.println("Connecting with device JWT authentication...");
    } else {
        Serial.println("Warning: No device JWT configured. Device may not receive updates due to RLS.");
    }
    
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
            break;
        case WStype_CONNECTED:
            Serial.println("WebSocket Connected!");
            subscribeToDevicesTable();
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
    
    // Subscribe to both UPDATE and INSERT events
    doc["payload"]["config"]["postgres_changes"][0]["event"] = "UPDATE";
    doc["payload"]["config"]["postgres_changes"][0]["schema"] = "public";
    doc["payload"]["config"]["postgres_changes"][0]["table"] = "devices";
    
    doc["payload"]["config"]["postgres_changes"][1]["event"] = "INSERT";
    doc["payload"]["config"]["postgres_changes"][1]["schema"] = "public";
    doc["payload"]["config"]["postgres_changes"][1]["table"] = "devices";
    
    doc["ref"] = messageRef++;
    
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
        Serial.println("Subscription to devices table successful.");
    } else if (event == "postgres_changes") {
        // Handle both UPDATE and INSERT events
        JsonObject data = doc["payload"]["data"]["record"];
        String eventType = doc["payload"]["data"]["eventType"];
        
        int gpio = data["gpio"];
        int state = data["state"];
        const char* deviceName = data["name"];

        if (eventType == "INSERT") {
            Serial.printf("New device added: %s on GPIO %d\n", deviceName, gpio);
            
            // Initialize the new GPIO pin if not already done
            if (!initializedPins[gpio] && gpio >= 0 && gpio <= 39) {
                initializeGPIO(gpio);
                Serial.printf("GPIO %d initialized for new device\n", gpio);
            }
        } else if (eventType == "UPDATE") {
            Serial.printf("Device update - GPIO %d, new state: %d", gpio, state);
            
            // Check if device name was updated (for rename functionality)
            if (deviceName) {
                Serial.printf(", device renamed to: %s", deviceName);
            }
            Serial.println();

            // Update GPIO state
            if (gpio >= 0 && gpio <= 39) {
                // Initialize GPIO if not already done (safety check)
                if (!initializedPins[gpio]) {
                    initializeGPIO(gpio);
                    Serial.printf("GPIO %d initialized on first use\n", gpio);
                }
                
                digitalWrite(gpio, state == 1 ? HIGH : LOW);
            } else {
                Serial.printf("Invalid GPIO %d\n", gpio);
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