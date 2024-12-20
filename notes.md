RAKE Overfitting


Investigate scoring mechanism in current implementation
Analyze why single-occurrence phrases get such high scores
Consider modifications to:

Score calculation
Frequency weighting
Phrase length penalties


Add validation to prevent HTML/UI artifacts
Need to ensure fixes don't break existing unit tests


TF-IDF Threshold Tuning


Document current score distribution across different document types
Research typical TF-IDF score ranges
Develop adaptive thresholding based on document length/type
Add pre-filtering for HTML/technical terms
Investigate why some documents return no results


NER Score Normalization


Add confidence scores from spaCy's NER
Develop scoring that considers:

Entity type importance
Frequency of occurrence
Context relevance


Normalize scores to be comparable with other methods
Consider weighting different entity types differently


Hybrid Rebalancing


Document current combination strategy
Analyze why RAKE phrases dominate
Develop new weighting scheme that:

Balances single words vs phrases
Properly weights NER contributions
Considers frequency consistently


Add method-specific normalization
Create comprehensive test suite for hybrid results

For each of these tasks, we should:

Create failing test case(s) that demonstrate the issue
Implement fix in isolation
Verify fix doesn't break other functionality
Document changes and rationale


Recommendations for improvement:

Better pre-filtering:

Use readability to clean content before any extraction
Add more thorough HTML artifact filtering
Normalize text better before processing


Balance method weights:

TF-IDF seems underrepresented in final results
Could improve frequency consideration across all methods
May want to boost single-word terms in some contexts


Consider content type:

Different documents might benefit from different extraction strategies
Technical docs might prefer TF-IDF
News articles might prefer NER
Blog posts might prefer RAKE