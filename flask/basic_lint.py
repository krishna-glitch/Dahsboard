#!/usr/bin/env python3
"""
Basic Python linter using built-in modules
Checks for syntax errors, basic style issues, and common problems
"""
import ast
import os
import re
import sys
from pathlib import Path

class BasicLinter:
    def __init__(self):
        self.issues = []
        self.files_checked = 0
        
    def check_syntax(self, filepath, content):
        """Check Python syntax using AST"""
        try:
            ast.parse(content, filename=filepath)
            return True
        except SyntaxError as e:
            self.issues.append({
                'file': filepath,
                'line': e.lineno,
                'type': 'ERROR',
                'code': 'E901',
                'message': f'SyntaxError: {e.msg}'
            })
            return False
    
    def check_basic_style(self, filepath, lines):
        """Basic PEP 8 style checks"""
        for line_no, line in enumerate(lines, 1):
            # Check line length (PEP 8: 79 characters)
            if len(line.rstrip()) > 120:  # Using 120 as more reasonable for modern development
                self.issues.append({
                    'file': filepath,
                    'line': line_no,
                    'type': 'WARNING',
                    'code': 'E501',
                    'message': f'line too long ({len(line.rstrip())} > 120 characters)'
                })
            
            # Check for trailing whitespace
            if line.rstrip() != line.rstrip(' \t'):
                self.issues.append({
                    'file': filepath,
                    'line': line_no,
                    'type': 'WARNING',
                    'code': 'W291',
                    'message': 'trailing whitespace'
                })
            
            # Check for tabs (PEP 8 prefers spaces)
            if '\t' in line:
                self.issues.append({
                    'file': filepath,
                    'line': line_no,
                    'type': 'WARNING',
                    'code': 'W191',
                    'message': 'indentation contains tabs'
                })
                
    def check_imports(self, filepath, lines):
        """Check import style"""
        import_lines = []
        for line_no, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped.startswith('import ') or stripped.startswith('from '):
                import_lines.append((line_no, stripped))
        
        # Check for wildcard imports
        for line_no, line in import_lines:
            if 'import *' in line:
                self.issues.append({
                    'file': filepath,
                    'line': line_no,
                    'type': 'WARNING',
                    'code': 'F403',
                    'message': "'from module import *' used; unable to detect undefined names"
                })
    
    def check_common_issues(self, filepath, content):
        """Check for common Python issues"""
        lines = content.split('\n')
        
        for line_no, line in enumerate(lines, 1):
            # Check for print statements (might want logging instead)
            if re.search(r'\bprint\s*\(', line) and 'debug' not in filepath.lower():
                self.issues.append({
                    'file': filepath,
                    'line': line_no,
                    'type': 'INFO',
                    'code': 'T001',
                    'message': 'print found (consider using logging)'
                })
            
            # Check for TODO/FIXME comments
            if re.search(r'\b(TODO|FIXME|HACK|XXX)\b', line, re.IGNORECASE):
                self.issues.append({
                    'file': filepath,
                    'line': line_no,
                    'type': 'INFO',
                    'code': 'T100',
                    'message': 'TODO/FIXME comment found'
                })
    
    def lint_file(self, filepath):
        """Lint a single Python file"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.split('\n')
            
            self.files_checked += 1
            
            # Check syntax first
            if not self.check_syntax(filepath, content):
                return  # Skip other checks if syntax error
                
            # Run other checks
            self.check_basic_style(filepath, lines)
            self.check_imports(filepath, lines)
            self.check_common_issues(filepath, content)
            
        except Exception as e:
            self.issues.append({
                'file': filepath,
                'line': 1,
                'type': 'ERROR',
                'code': 'E902',
                'message': f'IOError: {str(e)}'
            })
    
    def lint_directory(self, directory):
        """Lint all Python files in directory"""
        directory = Path(directory)
        
        # Skip common directories that don't need linting
        skip_dirs = {'.git', '__pycache__', '.pytest_cache', 'node_modules', 'venv', '.venv'}
        
        for py_file in directory.rglob('*.py'):
            # Skip if in a skip directory
            if any(skip_dir in py_file.parts for skip_dir in skip_dirs):
                continue
            
            self.lint_file(str(py_file))
    
    def print_results(self):
        """Print linting results"""
        if not self.issues:
            print(f"✅ All {self.files_checked} files passed basic linting!")
            return
        
        # Sort issues by file, then line number
        self.issues.sort(key=lambda x: (x['file'], x['line']))
        
        errors = sum(1 for issue in self.issues if issue['type'] == 'ERROR')
        warnings = sum(1 for issue in self.issues if issue['type'] == 'WARNING')
        infos = sum(1 for issue in self.issues if issue['type'] == 'INFO')
        
        print(f"Found {len(self.issues)} issues in {self.files_checked} files:")
        print(f"  {errors} errors, {warnings} warnings, {infos} info messages\n")
        
        current_file = None
        for issue in self.issues:
            if issue['file'] != current_file:
                current_file = issue['file']
                print(f"\n{current_file}:")
            
            type_icon = {'ERROR': '❌', 'WARNING': '⚠️', 'INFO': 'ℹ️'}[issue['type']]
            print(f"  {issue['line']:4d}:{issue['code']:5s} {type_icon} {issue['message']}")

def main():
    if len(sys.argv) > 1:
        target = sys.argv[1]
    else:
        target = '.'
    
    linter = BasicLinter()
    
    if os.path.isfile(target):
        linter.lint_file(target)
    else:
        linter.lint_directory(target)
    
    linter.print_results()
    
    # Exit with error code if there are errors
    errors = sum(1 for issue in linter.issues if issue['type'] == 'ERROR')
    return 1 if errors > 0 else 0

if __name__ == '__main__':
    sys.exit(main())