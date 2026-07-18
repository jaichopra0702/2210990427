Testing
# Add a test file with security issues
cat > test-findings.js << 'EOF'
const password = "hardcoded_password";
const query = "SELECT * FROM users WHERE id = " + userInput;
const hash = require('md5')(password);
EOF

git add test-findings.js
git commit -m "test: add code to trigger semgrep findings"
git push
Final see Output
