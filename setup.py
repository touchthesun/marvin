from setuptools import setup, find_packages

setup(
    name="marvin",
    version="0.1",
    packages=find_packages(),
    install_requires=[
        'rake-nltk',
        'pytest',
        'pytest-cov'
    ]
)