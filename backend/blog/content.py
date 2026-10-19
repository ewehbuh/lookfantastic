"""Allow safe editorial HTML; never trust stored HTML at rendering boundaries."""
import nh3

TAGS = {'p', 'br', 'hr', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i',
        'u', 's', 'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption',
        'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td'}
ATTRIBUTES = {'a': {'href', 'title'}, 'img': {'src', 'alt', 'width', 'height'},
              'th': {'colspan', 'rowspan'}, 'td': {'colspan', 'rowspan'}}


def clean_article_html(value):
    return nh3.clean(value, tags=TAGS, attributes=ATTRIBUTES,
                     url_schemes={'http', 'https', 'mailto'},
                     clean_content_tags={'script', 'style', 'iframe', 'object', 'embed'},
                     link_rel='noopener noreferrer')
