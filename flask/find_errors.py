#!/usr/bin/env python3
import ast
import os
from pathlib import Path

def find_syntax_errors():
    """Find syntax errors in Python files"""
    errors = []
    directory = Path('.')
    
    for py_file in directory.rglob('*.py'):
        try:
            with open(py_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            try:
                ast.parse(content, filename=str(py_file))
            except SyntaxError as e:
                errors.append({
                    'file': str(py_file),
                    'line': e.lineno,
                    'message': str(e.msg),
                    'text': e.text.strip() if e.text else ''
                })
                
        except Exception as e:
            print(f"Error reading {py_file}: {e}")
    
    return errors

if __name__ == '__main__':
    errors = find_syntax_errors()
    if errors:
        print(f"Found {len(errors)} syntax errors:")
        for error in errors:
            print(f"❌ {error['file']}:{error['line']} - {error['message']}")
            if error['text']:
                print(f"    {error['text']}")
    else:
        print("✅ No syntax errors found!")