#!/usr/bin/env python3
"""
Debug Database Connection - Test basic database queries
"""

import sys
import os
from datetime import datetime, timedelta
import pandas as pd

# Add the current directory to Python path
sys.path.insert(0, '/home/skrishna/migration/flask')

try:
    from config.database import db
    print("✅ Database module imported successfully")
except Exception as e:
    print(f"❌ Failed to import database module: {e}")
    exit(1)

def test_basic_connection():
    """Test basic database connection"""
    print("\n" + "="*50)
    print("1. TESTING BASIC CONNECTION")
    print("="*50)
    
    try:
        query = "SELECT 1 as test_value"
        result = db.execute_query(query)
        
        if not result.empty:
            print("✅ Basic connection: SUCCESS")
            print(f"   Result: {result.iloc[0]['test_value']}")
            return True
        else:
            print("❌ Basic connection: FAILED - Empty result")
            return False
            
    except Exception as e:
        print(f"❌ Basic connection: FAILED - {str(e)}")
        return False

def test_schemas():
    """Check available schemas"""
    print("\n" + "="*50)
    print("2. CHECKING AVAILABLE SCHEMAS")
    print("="*50)
    
    try:
        query = """
        SELECT schema_name 
        FROM information_schema.schemata 
        ORDER BY schema_name
        """
        result = db.execute_query(query)
        
        if not result.empty:
            print("✅ Available schemas:")
            for schema in result['schema_name']:
                print(f"   - {schema}")
            
            # Check if impact schema exists
            if 'impact' in result['schema_name'].values:
                print("✅ Impact schema exists")
                return True
            else:
                print("❌ Impact schema NOT FOUND")
                return False
        else:
            print("❌ No schemas found")
            return False
            
    except Exception as e:
        print(f"❌ Schema check failed: {str(e)}")
        return False

def test_tables():
    """Check tables in impact schema"""
    print("\n" + "="*50)
    print("3. CHECKING TABLES IN IMPACT SCHEMA")  
    print("="*50)
    
    try:
        query = """
        SELECT table_name, table_type
        FROM information_schema.tables 
        WHERE table_schema = 'impact'
        ORDER BY table_name
        """
        result = db.execute_query(query)
        
        if not result.empty:
            print("✅ Tables in impact schema:")
            for _, row in result.iterrows():
                print(f"   - {row['table_name']} ({row['table_type']})")
            return True
        else:
            print("❌ No tables found in impact schema")
            return False
            
    except Exception as e:
        print(f"❌ Table check failed: {str(e)}")
        return False

def test_table_data():
    """Check data in key tables"""
    print("\n" + "="*50)
    print("4. CHECKING TABLE DATA")
    print("="*50)
    
    tables = [
        'impact.site',
        'impact.water_quality', 
        'impact.redox_event',
        'impact.redox_measurement'
    ]
    
    for table in tables:
        try:
            query = f"SELECT COUNT(*) as count FROM {table}"
            result = db.execute_query(query)
            
            if not result.empty:
                count = result.iloc[0]['count']
                if count > 0:
                    print(f"   ✅ {table}: {count:,} rows")
                else:
                    print(f"   ⚠️  {table}: 0 rows (EMPTY)")
            else:
                print(f"   ❌ {table}: Query failed")
                
        except Exception as e:
            print(f"   ❌ {table}: ERROR - {str(e)}")

def test_site_data():
    """Test site table specifically"""
    print("\n" + "="*50)
    print("5. TESTING SITE DATA")
    print("="*50)
    
    try:
        query = """
        SELECT 
            site_id, code, description, status
        FROM impact.site
        ORDER BY code
        LIMIT 10
        """
        result = db.execute_query(query)
        
        if not result.empty:
            print(f"✅ Site data: {len(result)} rows")
            print("\nSample sites:")
            for _, row in result.iterrows():
                print(f"   {row['code']}: {row['description']} ({row['status']})")
            return True
        else:
            print("❌ No site data found")
            return False
            
    except Exception as e:
        print(f"❌ Site data test failed: {str(e)}")
        return False

def test_redox_join():
    """Test the redox join query"""
    print("\n" + "="*50) 
    print("6. TESTING REDOX JOIN QUERY")
    print("="*50)
    
    try:
        # Test individual tables first
        print("Testing redox_event table:")
        event_query = "SELECT COUNT(*) as count FROM impact.redox_event"
        event_result = db.execute_query(event_query)
        if not event_result.empty:
            event_count = event_result.iloc[0]['count']
            print(f"   redox_event: {event_count:,} rows")
        
        print("Testing redox_measurement table:")
        measurement_query = "SELECT COUNT(*) as count FROM impact.redox_measurement"  
        measurement_result = db.execute_query(measurement_query)
        if not measurement_result.empty:
            measurement_count = measurement_result.iloc[0]['count']
            print(f"   redox_measurement: {measurement_count:,} rows")
        
        # Test the join
        print("\nTesting join query:")
        join_query = """
        SELECT 
            re.measurement_timestamp,
            s.code as site_code,
            rm.depth_cm,
            rm.redox_value_mv
        FROM impact.redox_event re
        JOIN impact.redox_measurement rm ON re.time_window_id = rm.time_window_id 
                                          AND re.site_id = rm.site_id
        JOIN impact.site s ON re.site_id::varchar = s.site_id
        LIMIT 5
        """
        
        join_result = db.execute_query(join_query)
        
        if not join_result.empty:
            print(f"✅ Join query SUCCESS: {len(join_result)} rows")
            print("\nSample data:")
            print(join_result.to_string(index=False))
            return True
        else:
            print("❌ Join query returned no data")
            return False
            
    except Exception as e:
        print(f"❌ Redox join test failed: {str(e)}")
        return False

if __name__ == "__main__":
    print("🔍 DEBUGGING DATABASE CONNECTION AND DATA")
    
    # Run tests
    tests = [
        test_basic_connection,
        test_schemas, 
        test_tables,
        test_table_data,
        test_site_data,
        test_redox_join
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"❌ Test {test.__name__} crashed: {str(e)}")
            results.append(False)
    
    # Summary
    print("\n" + "="*60)
    print("DATABASE DEBUG SUMMARY")
    print("="*60)
    
    passed = sum(1 for r in results if r)
    total = len(results)
    
    print(f"Tests passed: {passed}/{total}")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED! Database connection and data look good.")
    else:
        print("⚠️  SOME TESTS FAILED! Check the specific failures above.")