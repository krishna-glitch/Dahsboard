from abc import ABC, abstractmethod
from typing import List, Dict, Any

class IDataService(ABC):
    """Interface for data services"""

    @abstractmethod
    def get_available_sites(self) -> List[Dict[str, Any]]:
        """Get all available monitoring sites"""
        pass
