"""
Lazy Module Loader for Performance Optimization
"""

import importlib
import logging
from typing import Any, Dict
from functools import lru_cache

logger = logging.getLogger(__name__)

class LazyModuleLoader:
    """Lazy loads modules only when needed to improve startup performance"""
    
    def __init__(self):
        self._modules: Dict[str, Any] = {}
        self._load_times: Dict[str, float] = {}
    
    @lru_cache(maxsize=128)
    def load(self, module_name: str) -> Any:
        """Load module lazily with caching"""
        if module_name in self._modules:
            return self._modules[module_name]
        
        try:
            import time
            start_time = time.time()
            
            module = importlib.import_module(module_name)
            self._modules[module_name] = module
            
            load_time = time.time() - start_time
            self._load_times[module_name] = load_time
            
            logger.debug(f"📦 Lazy loaded {module_name} in {load_time:.3f}s")
            return module
            
        except ImportError as e:
            logger.warning(f"❌ Failed to lazy load {module_name}: {e}")
            return None
    
    def preload_critical_modules(self):
        """Preload modules that are always needed"""
        critical_modules = [
            'pandas',
            'numpy',
            'logging'
        ]
        
        for module_name in critical_modules:
            self.load(module_name)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get loading statistics"""
        return {
            'loaded_modules': list(self._modules.keys()),
            'total_modules': len(self._modules),
            'load_times': self._load_times,
            'total_load_time': sum(self._load_times.values())
        }

# Global lazy loader instance
lazy_loader = LazyModuleLoader()

def lazy_import(module_name: str):
    """Decorator for lazy importing modules"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            module = lazy_loader.load(module_name)
            if module is None:
                raise ImportError(f"Required module {module_name} could not be loaded")
            # Make module available in function globals
            func.__globals__[module_name.split('.')[-1]] = module
            return func(*args, **kwargs)
        return wrapper
    return decorator