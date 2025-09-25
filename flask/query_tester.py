#!/usr/bin/env python3
"""
Direct Query Tester
Test individual queries against your Redshift database to isolate issues
"""

import pandas as pd
import sys
from pathlib import Path
from datetime import datetime, timedelta

# Add parent directory to path
sys.path.append(str(Path(__file__).parent))

# Import database connection
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

def test_schema_access():
    """Test impact schema access"""
    print("\n" + "="*50)
    print("2. TESTING SCHEMA ACCESS")
    print("="*50)
    
    # Test if impact schema exists
    try:
        query = """
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name = 'impact'
        """
        result = db.execute_query(query)
        
        if not result.empty:
            print("✅ Impact schema: EXISTS")
        else:
            print("❌ Impact schema: NOT FOUND")
            
            # Show available schemas
            query_schemas = "SELECT schema_name FROM information_schema.schemata"
            schemas = db.execute_query(query_schemas)
            print("   Available schemas:")
            for schema in schemas['schema_name']:
                print(f"   - {schema}")
            return False
            
    except Exception as e:
        print(f"❌ Schema access test failed: {str(e)}")
        return False
    
    return True

def test_table_existence():
    """Test if all expected tables exist"""
    print("\n" + "="*50)
    print("3. TESTING TABLE EXISTENCE")
    print("="*50)
    
    # Expected tables from redshift_schema.markdown
    expected_tables = [
        'site',
        'water_quality',
        'redox_event',
        'redox_measurement',
        'daily_water_quality',
        'monthly_water_quality',
        'monthly_redox_by_depth',
        'redox_averages'
    ]
    
    try:
        # Get all tables in impact schema
        query = """
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'impact'
        ORDER BY table_name
        """
        
        result = db.execute_query(query)
        
        if result.empty:
            print("❌ No tables found in impact schema")
            return False
        
        existing_tables = result['table_name'].tolist()
        print("Existing tables in impact schema:")
        
        all_exist = True
        for table in expected_tables:
            if table in existing_tables:
                print(f"   ✅ {table}")
            else:
                print(f"   ❌ {table} (MISSING)")
                all_exist = False
        
        # Show any unexpected tables
        unexpected = [t for t in existing_tables if t not in expected_tables]
        if unexpected:
            print("\nUnexpected tables found:")
            for table in unexpected:
                print(f"   ⚠️  {table}")
        
        return all_exist
        
    except Exception as e:
        print(f"❌ Table existence test failed: {str(e)}")
        return False

def test_table_row_counts():
    """Test row counts for each table"""
    print("\n" + "="*50)
    print("4. TESTING TABLE ROW COUNTS")
    print("="*50)
    
    tables = [
        'impact.site',
        'impact.water_quality',
        'impact.redox_event',
        'impact.redox_measurement',
        'impact.daily_water_quality',
        'impact.monthly_water_quality',
        'impact.monthly_redox_by_depth',
        'impact.redox_averages'
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
                    print(f"   ⚠️  {table}: {count} rows (EMPTY)")
            else:
                print(f"   ❌ {table}: Query returned empty result")
                
        except Exception as e:
            print(f"   ❌ {table}: ERROR - {str(e)}")

def test_site_query():
    """Test the site info query specifically"""
    print("\n" + "="*50)
    print("5. TESTING SITE QUERY")
    print("="*50)
    
    try:
        query = """
        SELECT 
            site_id,
            code,
            description,
            status,
            created_at
        FROM impact.site
        ORDER BY code
        """
        
        result = db.execute_query(query)
        
        if not result.empty:
            print(f"✅ Site query: SUCCESS - {len(result)} rows returned")
            print("\nSample data:")
            print(result.head().to_string(index=False))
            
            # Test data types
            print(f"\nColumn data types:")
            for col, dtype in result.dtypes.items():
                print(f"   {col}: {dtype}")
            
            return True
        else:
            print("❌ Site query: No data returned")
            return False
            
    except Exception as e:
        print(f"❌ Site query failed: {str(e)}")
        return False

def test_water_quality_query():
    """Test water quality query"""
    print("\n" + "="*50)
    print("6. TESTING WATER QUALITY QUERY")
    print("="*50)
    
    try:
        query = """
        SELECT 
            wq.measurement_timestamp,
            s.code as site_code,
            s.description as site_name,
            wq.water_level_m,
            wq.temperature_c,
            wq.conductivity_us_cm,
            wq.quality_flag,
            wq.record_count,
            wq.time_window_id
        FROM impact.water_quality wq
        JOIN impact.site s ON wq.site_id = s.site_id
        ORDER BY wq.measurement_timestamp DESC
        LIMIT 5
        """
        
        result = db.execute_query(query)
        
        if not result.empty:
            print(f"✅ Water quality query: SUCCESS - {len(result)} rows returned")
            print("\nSample data:")
            print(result.to_string(index=False))
            return True
        else:
            print("❌ Water quality query: No data returned")
            return False
            
    except Exception as e:
        print(f"❌ Water quality query failed: {str(e)}")
        
        # Try simpler query without join
        print("\nTrying query without join...")
        try:
            simple_query = "SELECT * FROM impact.water_quality LIMIT 3"
            simple_result = db.execute_query(simple_query)
            
            if not simple_result.empty:
                print("✅ Simple water quality query works:")
                print(simple_result.to_string(index=False))
            else:
                print("❌ Even simple water quality query failed")
                
        except Exception as e2:
            print(f"❌ Simple water quality query also failed: {str(e2)}")
        
        return False

def test_redox_query():
    """Test redox query with correct joins"""
    print("\n" + "="*50)
    print("7. TESTING REDOX QUERY")
    print("="*50)
    
    try:
        # First test individual tables
        print("Testing redox_event table:")
        event_query = "SELECT * FROM impact.redox_event LIMIT 2"
        event_result = db.execute_query(event_query)
        
        if not event_result.empty:
            print(f"✅ redox_event: {len(event_result)} rows")
            print("   Columns:", list(event_result.columns))
        else:
            print("❌ redox_event: No data")
            
        print("\nTesting redox_measurement table:")
        measurement_query = "SELECT * FROM impact.redox_measurement LIMIT 2"
        measurement_result = db.execute_query(measurement_query)
        
        if not measurement_result.empty:
            print(f"✅ redox_measurement: {len(measurement_result)} rows")
            print("   Columns:", list(measurement_result.columns))
        else:
            print("❌ redox_measurement: No data")
        
        # Now test the join
        print("\nTesting redox join query:")
        join_query = """
        SELECT 
            re.measurement_timestamp,
            s.code as site_code,
            rm.depth_cm,
            rm.redox_value_mv,
            rm.replicate_label,
            re.reference_electrode_mv,
            re.time_window_id
        FROM impact.redox_event re
        JOIN impact.redox_measurement rm ON re.time_window_id = rm.time_window_id 
                                          AND re.site_id = rm.site_id
        JOIN impact.site s ON re.site_id::varchar = s.site_id
        LIMIT 5
        """
        
        join_result = db.execute_query(join_query)
        
        if not join_result.empty:
            print(f"✅ Redox join query: SUCCESS - {len(join_result)} rows")
            print("\nSample data:")
            print(join_result.to_string(index=False))
            return True
        else:
            print("❌ Redox join query: No data returned")
            return False
            
    except Exception as e:
        print(f"❌ Redox query failed: {str(e)}")
        return False

def test_materialized_views():
    """Test materialized views"""
    print("\n" + "="*50)
    print("8. TESTING MATERIALIZED VIEWS")
    print("="*50)
    
    views = [
        'impact.daily_water_quality',
        'impact.monthly_water_quality',
        'impact.monthly_redox_by_depth',
        'impact.redox_averages'
    ]
    
    for view in views:
        try:
            query = f"SELECT * FROM {view} LIMIT 3"
            result = db.execute_query(query)
            
            if not result.empty:
                print(f"✅ {view}: {len(result)} rows")
            else:
                print(f"⚠️  {view}: No data")
                
        except Exception as e:
            print(f"❌ {view}: ERROR - {str(e)}")

def run_all_tests():
    """Run all database tests"""
    print("🔍 STARTING COMPREHENSIVE DATABASE QUERY TESTING")
    print("This will test each query component individually")
    
    tests = [
        test_basic_connection,
        test_schema_access,
        test_table_existence,
        test_table_row_counts,
        test_site_query,
        test_water_quality_query,
        test_redox_query,
        test_materialized_views
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
    print("SUMMARY OF TEST RESULTS")
    print("="*60)
    
    passed = sum(1 for r in results if r)
    total = len(results)
    
    print(f"Tests passed: {passed}/{total}")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED! Your queries should work.")
    elif passed == 0:
        print("❌ ALL TESTS FAILED! There's a fundamental connection issue.")
    else:
        print("⚠️  SOME TESTS FAILED! Check the specific failures above.")
        
    return results

if __name__ == "__main__":
    run_all_tests()