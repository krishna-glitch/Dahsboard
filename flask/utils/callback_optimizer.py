"""
Mock Callback Optimizer
"""

class CallbackOptimizer:
    def get_optimization_stats(self):
        return {'total_optimizations': 42}

callback_optimizer = CallbackOptimizer()