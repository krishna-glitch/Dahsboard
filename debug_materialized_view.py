#!/usr/bin/env python3
"""
Debug script to check materialized view state
"""
import os
import sys
sys.path.append('/home/skrishna/migration/flask')

from services.core_data_service import core_data_service
import pandas as pd

def check_materialized_view():
    """Check the state of mv_processed_eh materialized view"""
    print("🔥 [MV DEBUG] Checking mv_processed_eh materialized view...")
    print("="*60)
    
    try:
        # Check if materialized view exists
        check_mv_query = """
        SELECT schemaname, matviewname, matviewowner, ispopulated
        FROM pg_matviews 
        WHERE matviewname = 'mv_processed_eh'
        """
        
        mv_info = core_data_service.db.execute_query(check_mv_query, {})
        
        if mv_info.empty:
            print("❌ MATERIALIZED VIEW DOES NOT EXIST!")
            print("   This explains why queries are slow - falling back to complex joins")
            return False
        else:
            print("✅ Materialized view exists:")
            for _, row in mv_info.iterrows():
                print(f"   Schema: {row['schemaname']}")
                print(f"   Name: {row['matviewname']}")
                print(f"   Owner: {row['matviewowner']}")
                print(f"   Populated: {row['ispopulated']}")
                
                if not row['ispopulated']:
                    print("❌ MATERIALIZED VIEW IS NOT POPULATED!")
                    print("   This explains the performance issue - no pre-computed data")
                    return False
    
    except Exception as e:
        print(f"❌ Error checking materialized view: {e}")
        return False
    
    try:
        # Check row count in materialized view
        count_query = "SELECT COUNT(*) as count FROM impact.mv_processed_eh"
        count_result = core_data_service.db.execute_query(count_query, {})
        row_count = count_result['count'].iloc[0] if not count_result.empty else 0
        
        print(f"📊 Materialized view contains {row_count:,} rows")
        
        if row_count == 0:
            print("❌ MATERIALIZED VIEW IS EMPTY!")
            print("   This explains the timeout - no data to query")
            return False
            
        # Check date range in materialized view
        date_range_query = """
        SELECT 
            MIN(measurement_timestamp) as earliest,
            MAX(measurement_timestamp) as latest,
            COUNT(DISTINCT site_id) as site_count,
            COUNT(DISTINCT depth_cm) as depth_count
        FROM impact.mv_processed_eh
        """
        
        date_info = core_data_service.db.execute_query(date_range_query, {})
        
        if not date_info.empty:
            row = date_info.iloc[0]
            print(f"📅 Date range: {row['earliest']} to {row['latest']}")
            print(f"🏢 Sites: {row['site_count']}")
            print(f"📏 Depth levels: {row['depth_count']}")
            
        # Check sample data for Site S1
        sample_query = """
        SELECT mv.measurement_timestamp, mv.depth_cm, mv.processed_eh, s.code as site_code
        FROM impact.mv_processed_eh mv
        JOIN impact.site s ON mv.site_id::varchar = s.site_id
        WHERE s.code = 'S1'
        ORDER BY mv.measurement_timestamp DESC
        LIMIT 5
        """
        
        sample_data = core_data_service.db.execute_query(sample_query, {})
        
        if not sample_data.empty:
            print("\n📋 Sample S1 data (latest 5 records):")
            for _, row in sample_data.iterrows():
                print(f"   {row['measurement_timestamp']} | Depth: {row['depth_cm']}cm | Eh: {row['processed_eh']}mV")
        else:
            print("❌ No sample data found for Site S1")
            
        return True
        
    except Exception as e:
        print(f"❌ Error checking materialized view data: {e}")
        return False

def check_base_tables():
    """Check if base tables have data"""
    print("\n🔥 [BASE TABLES DEBUG] Checking source tables...")
    print("="*60)
    
    try:
        # Check if the base tables exist and have data
        base_queries = {
            'redox_data': "SELECT COUNT(*) as count FROM impact.redox_data WHERE site_code IN ('S1', 'S2')",
            'sensor_data': "SELECT COUNT(*) as count FROM impact.sensor_data WHERE site_code IN ('S1', 'S2')",
            'sites': "SELECT COUNT(*) as count FROM impact.site WHERE code IN ('S1', 'S2')"
        }
        
        for table, query in base_queries.items():
            try:
                result = core_data_service.db.execute_query(query, {})
                count = result['count'].iloc[0] if not result.empty else 0
                print(f"📊 {table}: {count:,} rows")
            except Exception as e:
                print(f"❌ {table}: Error - {e}")
                
        # Check redox data date range
        redox_range_query = """
        SELECT 
            MIN(measurement_timestamp) as earliest,
            MAX(measurement_timestamp) as latest
        FROM impact.redox_data 
        WHERE site_code IN ('S1', 'S2')
        """
        
        result = core_data_service.db.execute_query(redox_range_query, {})
        if not result.empty:
            row = result.iloc[0]
            print(f"📅 Redox data range: {row['earliest']} to {row['latest']}")
            
    except Exception as e:
        print(f"❌ Error checking base tables: {e}")

def refresh_materialized_view():
    """Attempt to refresh the materialized view"""
    print("\n🔄 [REFRESH DEBUG] Attempting to refresh materialized view...")
    print("="*60)
    
    try:
        refresh_query = "REFRESH MATERIALIZED VIEW impact.mv_processed_eh"
        core_data_service.db.execute_query(refresh_query, {})
        print("✅ Materialized view refreshed successfully")
        
        # Re-check row count after refresh
        count_query = "SELECT COUNT(*) as count FROM impact.mv_processed_eh"
        count_result = core_data_service.db.execute_query(count_query, {})
        row_count = count_result['count'].iloc[0] if not count_result.empty else 0
        print(f"📊 After refresh: {row_count:,} rows")
        
    except Exception as e:
        print(f"❌ Error refreshing materialized view: {e}")
        print("   You may need to create the materialized view first")

def main():
    print("🔥 [DEEP DEBUG] Analyzing materialized view performance regression...")
    print("This script will identify why mv_processed_eh queries are slow")
    print("\n" + "="*80)
    
    mv_exists = check_materialized_view()
    check_base_tables()
    
    if not mv_exists:
        print("\n🚨 ROOT CAUSE FOUND:")
        print("   The materialized view mv_processed_eh is either missing or not populated")
        print("   This forces queries to fall back to expensive JOIN operations")
        print("   Solution: Create and populate the materialized view")
        refresh_materialized_view()
    
    print("\n" + "="*80)
    print("🔥 [DEEP DEBUG] Analysis complete!")

if __name__ == "__main__":
    main()