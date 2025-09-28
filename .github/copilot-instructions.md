# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

### Systeminfo Adapter Context

This adapter collects comprehensive system information from local and remote systems using multiple data collection methods:

- **Primary Function**: System monitoring and information collection for ioBroker
- **Data Collection Methods**: 
  - Operating system commands execution
  - File system reading (local and remote)
  - Web scraping and API calls (HTML, JSON, XML parsing)
  - Node.js systeminformation library integration
- **Key Features**:
  - Bidirectional operation (read/write system information)
  - GPIO pin access for Raspberry Pi/Orange Pi
  - System LED control capabilities
  - Scheduled data collection with cron-like syntax
  - Multi-format data processing (text, HTML, JSON, XML)
- **External Dependencies**: 
  - `systeminformation` - Cross-platform system information
  - `cheerio` - Server-side HTML parsing and manipulation
  - `node-schedule` - Flexible job scheduling
  - `xml2js` - XML to JavaScript object conversion
- **Configuration Complexity**: Supports complex multi-source configuration with custom scheduling and data transformation

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Your validation logic here
                        
                        resolve();
                    } catch (error) {
                        console.error('Test error:', error);
                        reject(error);
                    }
                });
            });
        });
    }
});
```

#### Additional Testing Patterns
For adapters with specific state management (like systeminfo), implement comprehensive state verification:

```javascript
// Verify created states and their values
const states = await harness.states.getStatesAsync('your-adapter.0.*');
expect(Object.keys(states).length).toBeGreaterThan(5);

// Verify adapter info states
const connectionState = await harness.states.getStateAsync('your-adapter.0.info.connection');
expect(connectionState).toBeTruthy();
expect(connectionState.val).toBe(true);
```

#### Testing Best Practices

1. **Always use official ioBroker testing framework** - don't create custom testing solutions
2. **Test with realistic data** - use actual system responses where possible
3. **Handle async operations correctly** - properly await all adapter operations
4. **Validate state creation and updates** - ensure adapter creates expected states
5. **Test configuration edge cases** - invalid configs should be handled gracefully
6. **Mock external dependencies** - especially system commands and file operations
7. **Clean up resources** - ensure proper cleanup in test teardown

## Development Patterns

### Adapter Initialization
- Use `@iobroker/adapter-core` for modern adapter development
- Initialize adapter with proper options and event handlers
- Implement `ready()`, `stateChange()`, `objectChange()`, and `unload()` methods

### State Management
- Create states with appropriate types, roles, and properties
- Use proper state acknowledgment patterns
- Implement state change handlers for bidirectional adapters

### Error Handling
- Use appropriate logging levels (error, warn, info, debug)
- Implement comprehensive error handling for external operations
- Provide meaningful error messages and recovery options

### Resource Management
```javascript
async unload(callback) {
  try {
    // Clear all timers and intervals
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = undefined;
    }
    if (this.connectionTimer) {
      clearInterval(this.connectionTimer);
      this.connectionTimer = undefined;
    }
    // Close connections, clean up resources
    callback();
  } catch (e) {
    callback();
  }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

### Systeminfo Adapter Specific Testing

For the systeminfo adapter, consider testing:

- **Command execution**: Mock system command outputs
- **File reading**: Mock file system access with sample data
- **Web scraping**: Mock HTTP requests with example responses
- **Scheduling**: Test timer-based data collection
- **State creation**: Verify dynamic state generation
- **Data parsing**: Test JSON, XML, and HTML parsing logic
- **Error handling**: Test failures in external data sources

## Performance Considerations

### System Information Collection
- Implement appropriate intervals for system data polling
- Cache expensive system information calls
- Use efficient data parsing for large responses
- Handle high-frequency updates gracefully

### Memory Management
- Clean up parsed DOM objects from cheerio
- Manage scheduled tasks to prevent memory leaks
- Monitor adapter memory usage with system-intensive operations

### Network Operations
- Implement proper timeout handling for web requests
- Use connection pooling for multiple API calls
- Handle network failures gracefully with retry logic

## Security Considerations

### System Access
- Validate system commands before execution
- Sanitize file paths to prevent directory traversal
- Use appropriate permissions for system operations
- Secure GPIO access and system file modifications

### Data Privacy
- Be careful with system information exposure
- Consider data anonymization for sensitive system details
- Implement proper access controls for collected data