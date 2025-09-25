#!/usr/bin/env node

/**
 * Performance Anti-Pattern Checker
 * 
 * Scans staged React files for common performance issues
 * Run before commits to catch performance problems early
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes for terminal output
const colors = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// Performance anti-patterns to detect
const ANTI_PATTERNS = [
  {
    id: 'inline-style',
    pattern: /style=\{\{[^}]+\}\}/g,
    message: 'Inline style objects cause re-renders. Extract to constants.',
    severity: 'warning',
    example: 'const BUTTON_STYLE = { margin: 10 };'
  },
  {
    id: 'inline-function',
    pattern: /(?:onClick|onChange|onSubmit|onFocus|onBlur)=\{(?:\(\)|.*=>)/g,
    message: 'Inline functions cause child re-renders. Use useCallback.',
    severity: 'error',
    example: 'const handleClick = useCallback(() => {...}, []);'
  },
  {
    id: 'custom-cache',
    pattern: /useState\(new (Map|Set|WeakMap|WeakSet)\(\)\)/g,
    message: 'Custom caching defeats React Query. Use useQuery instead.',
    severity: 'error',
    example: 'const { data } = useQuery({ queryKey: [...], queryFn: ... });'
  },
  {
    id: 'missing-memo',
    pattern: /^const\s+\w+\s*=\s*\(\{[^}]*\}\)\s*=>\s*\(/gm,
    message: 'Presentational components should use React.memo.',
    severity: 'warning',
    example: 'const Component = React.memo(({ props }) => ...);'
  },
  {
    id: 'direct-fetch',
    pattern: /useEffect\(\(\)\s*=>\s*\{[^}]*fetch\(/g,
    message: 'Direct API calls in useEffect. Use React Query hooks.',
    severity: 'error',
    example: 'const { data } = useWaterQualityData(filters);'
  },
  {
    id: 'unstable-context',
    pattern: /<(\w+Context)\.Provider\s+value={(?!\s*\w+\s*})[^}]+\}/g,
    message: 'Context value not memoized. Wrap with useMemo.',
    severity: 'error',
    example: 'const value = useMemo(() => ({ ...values }), [deps]);'
  },
  {
    id: 'large-list',
    pattern: /\{data\.map\(.*=>/g,
    message: 'Large lists should use virtualization or DataTable component.',
    severity: 'warning',
    example: '<DataTable data={data} virtualized={data.length > 200} />'
  }
];

// Performance best practices to check for
const BEST_PRACTICES = [
  {
    id: 'react-memo',
    pattern: /React\.memo\(/g,
    message: 'Good: Component is memoized',
    type: 'good'
  },
  {
    id: 'use-callback',
    pattern: /useCallback\(/g,
    message: 'Good: Event handler is memoized',
    type: 'good'
  },
  {
    id: 'use-memo',
    pattern: /useMemo\(/g,
    message: 'Good: Expensive calculation is memoized',
    type: 'good'
  },
  {
    id: 'react-query',
    pattern: /useQuery\(/g,
    message: 'Good: Using React Query for data fetching',
    type: 'good'
  }
];

class PerformanceChecker {
  constructor() {
    this.issues = [];
    this.goodPractices = [];
    this.fileCount = 0;
  }

  // Get staged React files
  getStagedFiles() {
    try {
      const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
      return output
        .split('\n')
        .filter(file => file.match(/\.(jsx?|tsx?)$/))
        .filter(file => fs.existsSync(file));
    } catch {
      console.log(`${colors.yellow}Warning: Not a git repository or no staged files${colors.reset}`);
      // Fallback: check all React files in src
      return this.getAllReactFiles();
    }
  }

  // Fallback: get all React files in src directory
  getAllReactFiles() {
    const srcDir = path.join(process.cwd(), 'src');
    if (!fs.existsSync(srcDir)) return [];
    
    const files = [];
    const walkDir = (dir) => {
      const items = fs.readdirSync(dir);
      items.forEach(item => {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
          walkDir(fullPath);
        } else if (item.match(/\.(jsx?|tsx?)$/)) {
          files.push(fullPath);
        }
      });
    };
    
    walkDir(srcDir);
    return files;
  }

  // Check a single file for anti-patterns
  checkFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    this.fileCount++;
    
    // Check anti-patterns
    ANTI_PATTERNS.forEach(pattern => {
      lines.forEach((line, index) => {
        pattern.pattern.lastIndex = 0; // Reset regex
        if (pattern.pattern.test(line)) {
          this.issues.push({
            file: filePath,
            line: index + 1,
            code: line.trim(),
            pattern: pattern.id,
            message: pattern.message,
            severity: pattern.severity,
            example: pattern.example
          });
        }
      });
    });

    // Check best practices
    BEST_PRACTICES.forEach(practice => {
      if (practice.pattern.test(content)) {
        this.goodPractices.push({
          file: filePath,
          practice: practice.id,
          message: practice.message
        });
      }
    });
  }

  // Run the performance check
  run() {
    console.log(`${colors.blue}${colors.bold}🚀 React Performance Check${colors.reset}\n`);
    
    const files = this.getStagedFiles();
    
    if (files.length === 0) {
      console.log(`${colors.yellow}No React files to check${colors.reset}`);
      return true;
    }

    console.log(`Checking ${files.length} React files...\n`);

    files.forEach(file => this.checkFile(file));

    this.printResults();
    
    // Return true if no errors, false if there are errors
    return this.issues.filter(issue => issue.severity === 'error').length === 0;
  }

  // Print the results
  printResults() {
    const errors = this.issues.filter(i => i.severity === 'error');
    const warnings = this.issues.filter(i => i.severity === 'warning');

    // Print errors
    if (errors.length > 0) {
      console.log(`${colors.red}${colors.bold}❌ ERRORS (${errors.length})${colors.reset}`);
      errors.forEach(issue => this.printIssue(issue));
      console.log();
    }

    // Print warnings
    if (warnings.length > 0) {
      console.log(`${colors.yellow}${colors.bold}⚠️  WARNINGS (${warnings.length})${colors.reset}`);
      warnings.forEach(issue => this.printIssue(issue));
      console.log();
    }

    // Print good practices
    if (this.goodPractices.length > 0) {
      console.log(`${colors.green}${colors.bold}✅ GOOD PRACTICES (${this.goodPractices.length})${colors.reset}`);
      const practiceCount = {};
      this.goodPractices.forEach(practice => {
        practiceCount[practice.practice] = (practiceCount[practice.practice] || 0) + 1;
      });
      Object.entries(practiceCount).forEach(([practice, count]) => {
        const message = BEST_PRACTICES.find(p => p.id === practice)?.message;
        console.log(`${colors.green}  ✓ ${message} (${count} occurrences)${colors.reset}`);
      });
      console.log();
    }

    // Summary
    console.log(`${colors.bold}SUMMARY${colors.reset}`);
    console.log(`Files checked: ${this.fileCount}`);
    console.log(`${colors.red}Errors: ${errors.length}${colors.reset}`);
    console.log(`${colors.yellow}Warnings: ${warnings.length}${colors.reset}`);
    console.log(`${colors.green}Good practices: ${this.goodPractices.length}${colors.reset}`);

    if (errors.length === 0 && warnings.length === 0) {
      console.log(`\n${colors.green}${colors.bold}🎉 No performance issues found!${colors.reset}`);
    } else if (errors.length === 0) {
      console.log(`\n${colors.yellow}${colors.bold}⚠️  Please address warnings when possible${colors.reset}`);
    } else {
      console.log(`\n${colors.red}${colors.bold}❌ Please fix errors before committing${colors.reset}`);
    }
  }

  // Print a single issue
  printIssue(issue) {
    const color = issue.severity === 'error' ? colors.red : colors.yellow;
    const icon = issue.severity === 'error' ? '❌' : '⚠️';
    
    console.log(`${color}  ${icon} ${issue.file}:${issue.line}${colors.reset}`);
    console.log(`     ${issue.message}`);
    console.log(`     Code: ${colors.blue}${issue.code}${colors.reset}`);
    console.log(`     Fix:  ${colors.green}${issue.example}${colors.reset}`);
    console.log();
  }
}

// Run the checker
if (require.main === module) {
  const checker = new PerformanceChecker();
  const success = checker.run();
  process.exit(success ? 0 : 1);
}

module.exports = PerformanceChecker;