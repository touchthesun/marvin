from typing import Set, Optional
import functools
import pycountry
# import us
from dataclasses import dataclass, field
from core.utils.logger import get_logger

logger = get_logger(__name__)

@dataclass
class AbbreviationConfig:
    """Configuration for abbreviation handling.
    
    Attributes:
        custom_abbreviations: Additional abbreviations to recognize
        ignore_case: Whether to ignore case when matching
        max_cache_size: Maximum size for abbreviation caches
    """
    custom_abbreviations: Set[str] = field(default_factory=set)
    ignore_case: bool = True
    max_cache_size: int = 1000


class AbbreviationService:
    """Service for managing and validating abbreviations.
    
    This service provides:
    - Comprehensive abbreviation recognition
    - Variant form matching
    - Categorized abbreviation lookup
    """
    
    def __init__(self, config: AbbreviationConfig = None):
        """Initialize the service.
        
        Args:
            config: Optional service configuration
        """
        self.config = config or AbbreviationConfig()
        self.logger = get_logger(__name__)
        self._initialize_caches()
    
    def __init__(self, config: Optional[AbbreviationConfig] = None):
        """Initialize the service."""
        self.config = config or AbbreviationConfig()
        self.logger = get_logger(__name__)
        
        # Instead of modifying cache parameters after decoration,
        # we'll create the cached methods with the correct size up front
        self._country_codes = None
        self._us_state_codes = None
        self._tech_abbreviations = None
        self._org_abbreviations = None
        self._units_abbreviations = None
        self._product_names = None
    
    @functools.lru_cache(maxsize=1000)
    def get_country_codes(self) -> Set[str]:
        """Get ISO country codes and common country abbreviations."""
        codes = set()
        
        # ISO codes
        for country in pycountry.countries:
            codes.add(country.alpha_2.lower())
            codes.add(country.alpha_3.lower())
        
        # Common non-standard abbreviations
        common_codes = {
            'uk',   # United Kingdom (technically GB)
            'eu',   # European Union
            'uae',  # United Arab Emirates
            'usa',  # United States of America
            'drc',  # Democratic Republic of the Congo
            'roc',  # Republic of China (Taiwan)
            'prc',  # People's Republic of China
        }
        codes.update(common_codes)
        
        self._country_codes = codes if not self.config.ignore_case else {
                code.lower() for code in codes
            }
            
        return self._country_codes
    
    # @functools.lru_cache(maxsize=1000)
    # def get_us_state_codes(self) -> Set[str]:
    #     """Get US state abbreviations."""
    #     if self._us_state_codes is None:
    #         codes = {state.abbr for state in us.states.STATES}
    #         self._us_state_codes = codes if not self.config.ignore_case else {
    #             code.lower() for code in codes
    #         }
    #     return self._us_state_codes
    
    @functools.lru_cache(maxsize=1000)
    def get_tech_abbreviations(self) -> Set[str]:
        """Get technology and computing abbreviations."""
        abbrevs = {
            # Programming & Computing
            'ai', 'ml', 'nlp', 'api', 'sdk', 'ide', 'gui', 'cli', 'orm',
            'cpu', 'gpu', 'ram', 'rom', 'ssd', 'hdd', 'lan', 'wan', 'vpc',
            'sql', 'nosql', 'json', 'xml', 'yaml', 'html', 'css', 'js',
            
            # Internet & Web
            'url', 'uri', 'dns', 'ip', 'http', 'https', 'ftp', 'ssl', 'tls',
            'www', 'tcp', 'udp', 'smtp', 'imap', 'pop3',
            
            # Software Development
            'ci', 'cd', 'vcs', 'git', 'svn', 'ui', 'ux', 'dx',
            'jwt', 'oauth', 'saml', 'crud', 'rest', 'soap',
            
            # Cloud & Infrastructure
            'aws', 'gcp', 'vpc', 'ec2', 's3', 'rds', 'k8s', 'iaas', 'paas',
            'saas', 'faas', 'cdn',
            
            # Hardware & Devices
            'pc', 'usb', 'io', 'lcd', 'led', 'wifi', '5g', '4g', 'lte',
            
            # Extended Reality
            'ar', 'vr', 'xr', 'mr'
        }
        
        return abbrevs if not self.config.ignore_case else {
            abbrev.lower() for abbrev in abbrevs
        }
    
    @functools.lru_cache(maxsize=1000)
    def get_tech_abbreviations(self) -> Set[str]:
        """Get technology and computing abbreviations."""
        if self._tech_abbreviations is None:
            abbrevs = {
                # Programming & Computing
                'ai', 'ml', 'nlp', 'api', 'sdk', 'ide', 'gui', 'cli', 'orm',
                'cpu', 'gpu', 'ram', 'rom', 'ssd', 'hdd', 'lan', 'wan', 'vpc',
                'sql', 'nosql', 'json', 'xml', 'yaml', 'html', 'css', 'js',
                
                # Internet & Web
                'url', 'uri', 'dns', 'ip', 'http', 'https', 'ftp', 'ssl', 'tls',
                'www', 'tcp', 'udp', 'smtp', 'imap', 'pop3',
                
                # Software Development
                'ci', 'cd', 'vcs', 'git', 'svn', 'ui', 'ux', 'dx',
                'jwt', 'oauth', 'saml', 'crud', 'rest', 'soap',
                
                # Cloud & Infrastructure
                'aws', 'gcp', 'vpc', 'ec2', 's3', 'rds', 'k8s', 'iaas', 'paas',
                'saas', 'faas', 'cdn',
                
                # Hardware & Devices
                'pc', 'usb', 'io', 'lcd', 'led', 'wifi', '5g', '4g', 'lte',
                
                # Extended Reality
                'ar', 'vr', 'xr', 'mr'
            }
            self._tech_abbreviations = abbrevs if not self.config.ignore_case else {
                abbrev.lower() for abbrev in abbrevs
            }
        return self._tech_abbreviations
    
    @functools.lru_cache(maxsize=1000)
    def get_product_names(self) -> Set[str]:
        """Get special product and platform names."""
        names = {
            'ios', 'ipod', 'ipad', 'iphone', 'imac',  # Apple products
            'macos', 'watchos', 'tvos',
            'aws',   # Cloud platforms
            'gcp',
            'asp',   # Microsoft
            'sql',   # Databases
            'nosql',
            'mysql', 'postgresql', 'mongodb',
            'php',   # Languages
            'nodejs'
        }
        
        return names if not self.config.ignore_case else {
            name.lower() for name in names
        }
    
    @functools.lru_cache(maxsize=1000)
    def get_units_abbreviations(self) -> Set[str]:
        """Get unit abbreviations."""
        abbrevs = {
            # Time
            'ms', 'sec', 'min', 'hr', 'wk', 'mo', 'yr',
            
            # Distance
            'mm', 'cm', 'km', 'in', 'ft', 'yd', 'mi',
            
            # Weight/Mass
            'mg', 'kg', 'oz', 'lb',
            
            # Data
            'kb', 'mb', 'gb', 'tb', 'pb',
            
            # Other Common Units
            'mph', 'kph', 'dpi', 'ppi', 'fps', 'rpm'
        }
        
        return abbrevs if not self.config.ignore_case else {
            abbrev.lower() for abbrev in abbrevs
        }
    
    def get_all_abbreviations(self) -> Set[str]:
        """Get comprehensive set of all abbreviations."""
        all_abbrevs = set()
        all_abbrevs.update(self.get_country_codes())
        # all_abbrevs.update(self.get_us_state_codes())
        all_abbrevs.update(self.get_tech_abbreviations())
        all_abbrevs.update(self.get_units_abbreviations())
        all_abbrevs.update(self.get_product_names())
        all_abbrevs.update(self.config.custom_abbreviations)
        
        return all_abbrevs
    
    def is_abbreviation(self, text: str) -> bool:
        """Check if text is a known abbreviation.
        
        Args:
            text: Text to check
            
        Returns:
            True if text is a known abbreviation
        """
        check_text = text.lower() if self.config.ignore_case else text
        return check_text in self.get_all_abbreviations()
    
    def get_category(self, abbreviation: str) -> Optional[str]:
        """Get category of an abbreviation.
        
        Args:
            abbreviation: Abbreviation to categorize
            
        Returns:
            Category name or None if not a known abbreviation
        """
        check_text = abbreviation.lower() if self.config.ignore_case else abbreviation
        
        if check_text in self.get_country_codes():
            return 'country'
        if check_text in self.get_us_state_codes():
            return 'us_state'
        if check_text in self.get_tech_abbreviations():
            return 'technology'
        if check_text in self.get_org_abbreviations():
            return 'organization'
        if check_text in self.get_units_abbreviations():
            return 'unit'
        if check_text in self.get_product_names():
            return 'product'
        if check_text in self.config.custom_abbreviations:
            return 'custom'
            
        return None