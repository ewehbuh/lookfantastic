from rest_framework import serializers


class SearchQuerySerializer(serializers.Serializer):
    q = serializers.CharField(required=False, max_length=200)
    search = serializers.CharField(required=False, max_length=200)

    def validate(self, attrs):
        values = {key: ' '.join(value.split()) for key, value in attrs.items()}
        if 'q' in values and 'search' in values and values['q'] != values['search']:
            raise serializers.ValidationError({'q': 'Use one search query.'})
        query = values.get('q', values.get('search', ''))
        if not query:
            raise serializers.ValidationError({'q': 'A search query is required.'})
        if len(query.split()) > 10:
            raise serializers.ValidationError({'q': 'Use at most ten search terms.'})
        return {'query': query}
